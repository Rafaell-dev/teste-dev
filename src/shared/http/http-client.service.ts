import { Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

export class HttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

export interface HttpResponse<T> {
  data: T;
  status: number;
}

@Injectable()
export class HttpClientService {
  /**
   * Performs a GET request with a configurable timeout.
   *
   * Throws HttpTimeoutError when the request exceeds the given timeout.
   * All other errors are re-thrown as-is so callers can handle them.
   *
   * Note: validateStatus is set to always return true so non-2xx responses
   * are returned to the caller rather than thrown as AxiosError. This allows
   * providers to interpret HTTP status codes themselves.
   */
  async get<T>(url: string, timeoutMs: number): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await axios.get<T>(url, {
        signal: controller.signal,
        validateStatus: () => true,
      });

      return { data: response.data, status: response.status };
    } catch (error) {
      const axiosError = error as AxiosError;

      if (
        axiosError.code === 'ERR_CANCELED' ||
        axiosError.name === 'AbortError' ||
        axiosError.name === 'CanceledError'
      ) {
        throw new HttpTimeoutError(url, timeoutMs);
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
