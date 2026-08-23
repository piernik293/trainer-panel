import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { getSubscriptionSummary } from "../services/subscriptionService";

const router: IRouter = Router();

router.get("/subscription/summary", requireAuth, async (req, res): Promise<void> => {
  const summary = await getSubscriptionSummary(req.trainer!.id);
  res.json(summary);
});

export default router;