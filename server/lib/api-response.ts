import type { Response } from "express";

export type ApiSuccess<T extends Record<string, unknown> = Record<never, never>> = {
  success: true;
  message?: string;
} & T;

export type ApiError = {
  success: false;
  message: string;
};

export type ApiResponse<T extends Record<string, unknown> = Record<never, never>> =
  | ApiSuccess<T>
  | ApiError;

export function sendSuccess(
  res: Response,
  data?: Record<string, unknown> | null,
  message?: string
): void {
  const body: Record<string, unknown> = { success: true };
  if (message !== undefined) body.message = message;
  if (data != null) Object.assign(body, data);
  res.json(body);
}

export function sendError(
  res: Response,
  httpStatus: number,
  message: string
): void {
  res.status(httpStatus).json({ success: false, message } satisfies ApiError);
}
