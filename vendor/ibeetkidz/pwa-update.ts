// Adaptations: bounded startup activation requests and timeout listener cleanup.
import protocol from "./pwa-update-protocol.json";

export interface WaitingWorker {
  postMessage(message: { readonly type: string }): void;
}

export interface ActiveWorker {
  postMessage(message: { readonly type: string }, transfer: Transferable[]): void;
}

export interface PwaRegistration {
  readonly waiting: WaitingWorker | null;
  readonly active: ActiveWorker | null;
}

export interface ActiveReleaseProbe {
  readonly result: Promise<string | null>;
  stop(): void;
}

export interface PwaUpdatePort {
  readonly controlledAtLoad: boolean;
  register(): Promise<PwaRegistration>;
  probeControllingRelease(): ActiveReleaseProbe;
  onControllerChange(listener: () => void): () => void;
  onTimeout(timeoutMs: number, listener: () => void): () => void;
  reload(): void;
}

export type PwaUpdateDisposition = "boot-current" | "reload-requested";

/**
 * Activates only a worker that was already waiting when this page loaded.
 * Workers discovered later remain waiting until the child's next explicit load.
 */
export async function prepareWaitingPwaUpdate(
  port: PwaUpdatePort,
  bootTimeoutMs: number,
  loadedReleaseId: string,
  activationDelaysMs: readonly number[] = [],
): Promise<PwaUpdateDisposition> {
  let stopTimeout: () => void = () => undefined;
  const deadline = new Promise<"timed-out">((resolve) => {
    stopTimeout = port.onTimeout(bootTimeoutMs, () => resolve("timed-out"));
  });
  let stopControllerChange: () => void = () => undefined;
  let controllerChanged = false;
  let reloadRequested = false;
  let resolveActivation: () => void = () => undefined;
  const activation = new Promise<"activated">((resolve) => {
    resolveActivation = () => resolve("activated");
  });
  const reloadOnce = () => {
    if (reloadRequested) return;
    reloadRequested = true;
    stopControllerChange();
    port.reload();
  };
  if (port.controlledAtLoad) {
    try {
      // Subscribe before registration: an update may naturally activate while
      // the explicit navigation is between its old response and composition.
      stopControllerChange = port.onControllerChange(() => {
        if (controllerChanged) return;
        controllerChanged = true;
        resolveActivation();
        reloadOnce();
      });
    } catch {
      stopTimeout();
      return "boot-current";
    }
  }

  const registrationResult = Promise.resolve()
    .then(() => port.register())
    .then(
      (registration) => ({ kind: "registered", registration }) as const,
      () => ({ kind: "registration-failed" }) as const,
    );
  const firstResult = await Promise.race([
    registrationResult,
    deadline.then(() => ({ kind: "timed-out" }) as const),
    activation.then(() => ({ kind: "controller-changed" }) as const),
  ]);
  if (firstResult.kind === "controller-changed") {
    stopTimeout();
    return "reload-requested";
  }
  if (firstResult.kind !== "registered") {
    stopControllerChange();
    stopTimeout();
    return "boot-current";
  }

  if (controllerChanged) {
    stopTimeout();
    return "reload-requested";
  }

  const waiting = firstResult.registration.waiting;
  if (!waiting) {
    const probe = port.probeControllingRelease();
    const releaseResult = await Promise.race([
      probe.result.then(
        (releaseId) => ({ kind: "release", releaseId }) as const,
        () => ({ kind: "probe-failed" }) as const,
      ),
      deadline.then(() => ({ kind: "timed-out" }) as const),
    ]);
    probe.stop();
    stopTimeout();
    if (controllerChanged) return "reload-requested";
    if (
      releaseResult.kind === "release"
      && releaseResult.releaseId !== null
      && releaseResult.releaseId !== loadedReleaseId
    ) {
      reloadOnce();
      return "reload-requested";
    }
    stopControllerChange();
    return "boot-current";
  }

  try {
    waiting.postMessage({ type: protocol.messageType });
  } catch {
    stopControllerChange();
    stopTimeout();
    return "boot-current";
  }

  // A navigation can briefly leave its old document in clients.matchAll.
  // Retry only inside this boot deadline, with a caller-bound delay sequence.
  // At the limit, keep the old release and leave the replacement staged.
  let cancelActivationRequest: () => void = () => undefined;
  let requestIndex = 0;
  const scheduleActivationRequest = () => {
    if (requestIndex >= Math.min(3, activationDelaysMs.length)) return;
    cancelActivationRequest = port.onTimeout(activationDelaysMs[requestIndex++]!, () => {
      try { waiting.postMessage({ type: protocol.messageType }); } catch { return; }
      scheduleActivationRequest();
    });
  };
  scheduleActivationRequest();
  const result = await Promise.race([activation, deadline]);
  cancelActivationRequest();
  stopTimeout();
  if (result === "timed-out") {
    stopControllerChange();
    // Covers the narrow ordering where both promises settled before this
    // continuation ran but the deadline won Promise.race.
    if (controllerChanged) reloadOnce();
    return "boot-current";
  }

  // controllerchange can be emitted more than once, but this boundary performs
  // one non-retriable navigation for the worker activated by this page load.
  reloadOnce();
  return "reload-requested";
}

export function createBrowserPwaUpdatePort(baseUrl: string): PwaUpdatePort | null {
  if (!("serviceWorker" in navigator)) return null;

  return {
    controlledAtLoad: navigator.serviceWorker.controller !== null,
    register: () => navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }),
    probeControllingRelease: () => {
      // The controller is authoritative for this document's requests. The
      // registration's active worker can be newer while the old controller is
      // still serving this client; controllerchange covers the transition.
      const controller = navigator.serviceWorker.controller;
      const channel = new MessageChannel();
      let stopped = false;
      const result = new Promise<string | null>((resolve) => {
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
          if (stopped) return;
          const response = event.data;
          resolve(
            typeof response === "object"
              && response !== null
              && "type" in response
              && response.type === protocol.releaseResponseType
              && "releaseId" in response
              && typeof response.releaseId === "string"
              ? response.releaseId
              : null,
          );
        };
        try {
          controller?.postMessage(
            { type: protocol.releaseRequestType },
            [channel.port2],
          );
          if (!controller) resolve(null);
        } catch {
          resolve(null);
        }
      });
      return {
        result,
        stop: () => {
          stopped = true;
          channel.port1.close();
          channel.port2.close();
        },
      };
    },
    onControllerChange: (listener) => {
      navigator.serviceWorker.addEventListener(protocol.controllerChangeEvent, listener, { once: true });
      return () => navigator.serviceWorker.removeEventListener(protocol.controllerChangeEvent, listener);
    },
    onTimeout: (timeoutMs, listener) => {
      const timeout = window.setTimeout(listener, timeoutMs);
      return () => window.clearTimeout(timeout);
    },
    reload: () => window.location.reload(),
  };
}

export function prepareBrowserPwaUpdate(
  baseUrl: string,
  bootTimeoutMs: number,
  loadedReleaseId: string,
  activationDelaysMs: readonly number[] = [],
): Promise<PwaUpdateDisposition> {
  const port = createBrowserPwaUpdatePort(baseUrl);
  return port
    ? prepareWaitingPwaUpdate(port, bootTimeoutMs, loadedReleaseId, activationDelaysMs)
    : Promise.resolve("boot-current");
}
