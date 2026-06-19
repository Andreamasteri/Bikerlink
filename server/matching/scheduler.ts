import { schedulerLogger, matchingLogger } from "../lib/logger";
import { hookPinoLogger } from "./match-log-buffer";

// Tap both loggers so every info/warn/error line automatically lands in the
// in-memory ring buffer (not only the explicit addMatchLog() call-sites).
hookPinoLogger(schedulerLogger, "scheduler");
hookPinoLogger(matchingLogger, "matching");

export {
  getLastMatchingCycleMeta,
  getLastCycleOutcome,
  getMatchingLockState,
  getMatchingLockStatus,
  forceUnlockMatching,
  triggerMatchingRun,
} from "./scheduler.cycle";

export {
  startMatchingEngine,
  stopMatchingEngine,
} from "./scheduler.engine";

export {
  triggerProposalProfileMatchingForZavorrina,
  triggerProposalCreatedMatching,
  triggerMatchingForUser,
} from "./scheduler.helpers";
