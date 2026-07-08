import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import surveysRouter from "./surveys";
import statsRouter from "./stats";
import publicRouter from "./public";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(surveysRouter);
router.use(statsRouter);
router.use(publicRouter);

export default router;
