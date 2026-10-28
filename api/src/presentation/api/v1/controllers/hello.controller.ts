import type { Request, Response } from "express";

export const hello = (_req: Request, res: Response): void => {
  res.json({ message: "Hello, world!" });
};
