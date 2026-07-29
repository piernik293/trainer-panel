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
import planDraftInputRouter from "./planDraftInput";
import planDraftDayRecommendationsRouter from "./planDraftDayRecommendations";
import planDraftGenerateDayRouter from "./planDraftGenerateDay";
import planDraftBalanceWeekRouter from "./planDraftBalanceWeek";
import planDraftRecordGenerationRouter from "./planDraftRecordGeneration";
import clientPortalRouter from "./clientPortal";

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
router.use(planDraftInputRouter);
router.use(planDraftDayRecommendationsRouter);
router.use(planDraftGenerateDayRouter);
router.use(planDraftBalanceWeekRouter);
router.use(planDraftRecordGenerationRouter);
router.use(clientPortalRouter);

export default router;
