import { Router, type IRouter } from "express";
import samplesRouter from "./samples";
import batchesRouter from "./batches";
import dashboardRouter from "./dashboard";
import optionsRouter, { seedOptions } from "./options";
import varietiesRouter from "./varieties";
import strainsRouter from "./strains";
import appSettingsRouter from "./appSettings";
import usersRouter from "./users";
import changeLogRouter from "./changeLog";
import stageIntervalsRouter from "./stageIntervals";
import scheduleRouter from "./schedule";

const router: IRouter = Router();

router.use(samplesRouter);
router.use(batchesRouter);
router.use(dashboardRouter);
router.use(optionsRouter);
router.use(varietiesRouter);
router.use(strainsRouter);
router.use(appSettingsRouter);
router.use(usersRouter);
router.use(changeLogRouter);
router.use(stageIntervalsRouter);
router.use(scheduleRouter);

// Seed default lookup options if empty
seedOptions().catch((err) => console.error("seedOptions failed:", err));

export default router;
