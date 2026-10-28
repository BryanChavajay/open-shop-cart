import { Router } from "express";
import { hello } from "./controllers/hello.controller.js";
import { errorHandler } from "./middleware/error.middleware.js";

export const v1Router: Router = Router();

v1Router.get("/hello", hello);

v1Router.use(errorHandler);
