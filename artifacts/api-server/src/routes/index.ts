import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import surveysRouter from "./surveys";
import statsRouter from "./stats";
import publicRouter from "./public";
import notesRouter from "./notes";
import exercisesRouter from "./exercises";
import musclesRouter from "./muscles";
import plansRouter from "./plans";
import recommendationsRouter from "./recommendations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(surveysRouter);
router.use(statsRouter);
router.use(publicRouter);
router.use(notesRouter);
router.use(exercisesRouter);
router.use(musclesRouter);
router.use(plansRouter);
router.use(recommendationsRouter);

export default router;
