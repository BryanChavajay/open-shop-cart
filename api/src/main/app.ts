import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { v1Router } from "../presentation/api/v1/router.js";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/v1", v1Router);

export { app };
