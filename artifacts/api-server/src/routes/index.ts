import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import surveysRouter from "./surveys";
import statsRouter from "./stats";
import dashboardRouter from "./dashboard";
import publicRouter from "./public";
import notesRouter from "./notes";
import exerciseReviewRouter from "./exerciseReview";
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
import surveyInvitesRouter from "./surveyInvites";
import clientInvitationsRouter from "./clientInvitations";
import bookingsRouter from "./bookings";
import subscriptionRouter from "./subscription";
import trainerProfileRouter from "./trainerProfile";
import trainingRouter from "./training";
import stepsRouter from "./steps";
import clientSettingsRouter from "./clientSettings";
import planImportRouter from "./planImport";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(surveysRouter);
router.use(statsRouter);
router.use(dashboardRouter);
router.use(publicRouter);
router.use(surveyInvitesRouter);
router.use(notesRouter);
router.use(exerciseReviewRouter);
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
router.use(clientInvitationsRouter);
router.use(bookingsRouter);
router.use(subscriptionRouter);
router.use(trainerProfileRouter);
router.use(trainingRouter);
router.use(stepsRouter);
router.use(clientSettingsRouter);
router.use(planImportRouter);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RELATED-ROUTE SECURITY AUDIT — Task #80
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The five client CRUD routes (/clients, /clients/:id) are now protected by
 * requireAuth and scoped to the signed-in trainer. The routes below accept
 * :clientId or return client-related data but are NOT yet protected.
 *
 * These MUST be secured in the follow-up task before the app is declared safe
 * for multi-trainer public deployment.
 *
 * | Route                                              | Accepts clientId | Returns client data | Protected (Task #80) |
 * |----------------------------------------------------|-----------------|---------------------|----------------------|
 * | GET  /clients/:clientId/survey                     | YES             | YES (survey)        | NO                   |
 * | GET  /clients/:clientId/surveys                    | YES             | YES (surveys)       | NO                   |
 * | GET  /clients/:clientId/surveys/:surveyId          | YES             | YES (survey)        | NO                   |
 * | GET  /clients/:clientId/avoided-exercises          | YES             | YES (survey data)   | NO                   |
 * | PUT  /clients/:clientId/survey                     | YES             | YES (survey)        | NO                   |
 * | PATCH /clients/:clientId/surveys/:surveyId         | YES             | YES (survey)        | NO                   |
 * | GET  /clients/:clientId/notes                      | YES             | YES (notes)         | NO                   |
 * | POST /clients/:clientId/notes                      | YES             | YES (note)          | NO                   |
 * | PATCH /clients/:clientId/notes/:noteId             | YES             | YES (note)          | NO                   |
 * | DELETE /clients/:clientId/notes/:noteId            | YES             | YES (note)          | NO                   |
 * | GET  /clients/:clientId/plans (via plans router)   | YES             | YES (plans)         | NO                   |
 * | POST /clients/:clientId/plans                      | YES             | YES (plan)          | NO                   |
 * | GET  /clients/:clientId/plan-draft-input           | YES             | YES (client data)   | NO                   |
 * | POST /plans/draft-volume/preview                   | YES (body)      | YES (vol data)      | NO                   |
 * | POST /plans/volume-preview                         | YES (body)      | YES (vol data)      | NO                   |
 * | POST /plans/analysis-preview                       | YES (body)      | YES (plan data)     | NO                   |
 * | POST /clients/:clientId/plan-draft/generate-day    | YES             | YES (exercises)     | NO                   |
 * | POST /clients/:clientId/plan-draft/balance-week    | YES             | YES (plan data)     | NO                   |
 * | POST /clients/:clientId/plan-draft/record-generation | YES           | YES (usage log)     | NO                   |
 * | GET  /clients/:clientId/exercise-recommendations   | YES             | YES (exercises)     | NO                   |
 * | GET  /clients/:clientId/workout-sessions           | YES             | YES (sessions)      | NO                   |
 * | GET  /clients/:clientId/workout-sessions/:id       | YES             | YES (session)       | NO                   |
 * | GET  /stats                                        | NO              | YES (aggregates)    | NO                   |
 * | GET  /client-portal/plan                           | YES (Clerk)     | YES (plan)          | YES (requireClientAuth) |
 * | POST /client-portal/sessions                       | YES (body)      | YES (session)       | NO (client-keyed)    |
 *
 * ⚠️  THIS APP IS NOT SAFE FOR MULTI-TRAINER PUBLIC DEPLOYMENT until the above
 * routes are protected in the next task.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default router;
