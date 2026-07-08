import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import surveysRouter from "./surveys";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(surveysRouter);
router.use(statsRouter);

export default router;
