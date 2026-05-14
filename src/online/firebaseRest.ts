export class FirebaseRestClient {
  private readonly databaseURL: string;

  constructor(databaseURL: string) {
    this.databaseURL = databaseURL.replace(/\/$/, '');
  }

  public async get<T>(path: string): Promise<T | null> {
    const response = await fetch(this.url(path), { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Firebase GET failed: ${response.status}`);
    }
    return response.json();
  }

  public async put<T>(path: string, data: T): Promise<T> {
    const response = await fetch(this.url(path), {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    if (!response.ok) {
      throw new Error(`Firebase PUT failed: ${response.status}`);
    }
    return response.json();
  }

  public async patch<T>(path: string, data: Partial<T> | object): Promise<T> {
    const response = await fetch(this.url(path), {
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    if (!response.ok) {
      throw new Error(`Firebase PATCH failed: ${response.status}`);
    }
    return response.json();
  }

  public listen<T>(path: string, onValue: (value: T | null) => void, onError: (error: Error) => void): () => void {
    const EventSourceCtor = (window as any).EventSource;
    if (!EventSourceCtor) {
      let stopped = false;
      const poll = async () => {
        if (stopped) {
          return;
        }
        try {
          onValue(await this.get<T>(path));
        } catch (error) {
          onError(error as Error);
        }
        window.setTimeout(poll, 1000);
      };
      poll();
      return () => {
        stopped = true;
      };
    }

    let currentValue: any = null;
    const source = new EventSourceCtor(this.url(path));
    const onStreamingEvent = (event: MessageEvent) => {
      try {
        currentValue = this.mergeStreamingPayload(currentValue, JSON.parse(event.data));
        onValue(currentValue as T | null);
      } catch (error) {
        onError(error as Error);
      }
    };
    source.addEventListener('put', onStreamingEvent);
    source.addEventListener('patch', onStreamingEvent);
    source.onerror = () => onError(new Error('Firebase realtime connection dropped'));
    return () => source.close();
  }

  private mergeStreamingPayload(currentValue: any, payload: any) {
    if (!payload || payload.data === undefined) {
      return currentValue;
    }
    if (payload.path === '/') {
      return payload.data;
    }
    const pathParts = String(payload.path || '').split('/').filter(Boolean);
    const nextValue = currentValue ? { ...currentValue } : {};
    let cursor = nextValue;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      cursor[part] = cursor[part] && typeof cursor[part] === 'object' ? { ...cursor[part] } : {};
      cursor = cursor[part];
    }
    const leaf = pathParts[pathParts.length - 1];
    if (payload.data === null) {
      delete cursor[leaf];
    } else if (leaf) {
      cursor[leaf] = payload.data;
    }
    return nextValue;
  }

  private url(path: string) {
    const cleanPath = path.replace(/^\//, '').replace(/\.json$/, '');
    return `${this.databaseURL}/${cleanPath}.json`;
  }
}
