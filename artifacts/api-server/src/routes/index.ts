import { Router, type IRouter } from "express";
import healthRouter from "./health";
import samplesRouter from "./samples";
import transfersRouter from "./transfers";
import dashboardRouter from "./dashboard";
import optionsRouter, { seedOptions } from "./options";

const router: IRouter = Router();

router.use(healthRouter);
router.use(samplesRouter);
router.use(transfersRouter);
router.use(dashboardRouter);
router.use(optionsRouter);

// Seed default lookup options if empty
seedOptions().catch((err) => console.error("seedOptions failed:", err));

export default router;
