import { useEffect, useRef, useState } from "react";
import { api, type DemoState, type DemoStepResult, type EventItem } from "../lib/api";
import { fmtMult, fmtPrice8, shortHex } from "../lib/format";
import { HexLink } from "./ui";
import { createSceneController } from "../lib/scene";

/** The demo's onchain action can exist before (or without) an indexed canonical row. */
export function DemoEvidenceAssembly({ state, log }: { state: DemoState; log: DemoStepResult[] }) {
  const root = useRef<HTMLElement>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventError, setEventError] = useState(false);
  const actionId = state.demoActionId;
  const attestation = log.find((entry) => entry.step === "attest" && entry.ok);
  const attestationTx = attestation?.txs.find((tx) => /attest|action/i.test(tx.label));
  const ordered = [...events].sort(
    (a, b) => a.block_number - b.block_number || a.log_index - b.log_index,
  );

  useEffect(() => {
    if (!actionId) return;
    let live = true;
    setEvents([]);
    setEventError(false);
    const read = () => {
      void api
        .events(`?actionId=${actionId}`)
        .then((result) => {
          if (live) {
            setEvents(result.events);
            setEventError(false);
          }
        })
        .catch(() => {
          if (live) setEventError(true);
        });
    };
    read();
    const timer = setInterval(read, 8000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [actionId, state.runId]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const controller = createSceneController(
      element,
      (progress) => {
        element.style.setProperty("--dossier-open", String(Math.min(1, progress / 0.28)));
        element.style.setProperty(
          "--dossier-layers",
          String(Math.max(0, Math.min(1, (progress - 0.2) / 0.42))),
        );
        element.style.setProperty(
          "--dossier-path",
          String(Math.max(0, Math.min(1, (progress - 0.55) / 0.45))),
        );
      },
      { intro: 1, introOnView: true },
    );
    const replay = () => controller.replay();
    window.addEventListener("corpshift:dossier-replay", replay);
    return () => {
      window.removeEventListener("corpshift:dossier-replay", replay);
      controller.destroy();
    };
  }, [actionId]);

  if (!actionId) return null;
  return (
    <section
      ref={root}
      id="lab-evidence-assembly"
      className="dossier-assembly"
      aria-label="Demo action evidence assembly"
    >
      <div className="dossier-source-row">
        <span>SELECTED DEMO ACTION</span>
        <strong>{shortHex(actionId)}</strong>
        <HexLink hex={actionId} />
        <button
          className="dossier-replay"
          onClick={() => window.dispatchEvent(new Event("corpshift:dossier-replay"))}
        >
          Replay assembly ↻
        </button>
      </div>
      <div className="dossier-layers">
        <div>
          <span>01 / SOURCE FACTS</span>
          <strong>4:1 split scenario</strong>
          <p>
            Observed in the shared Anvil demo. External issuer source facts are not provided by the
            demo API.
          </p>
        </div>
        <div>
          <span>02 / CANONICAL STATE</span>
          <strong>Observed {fmtMult(state.uiMultiplier)}</strong>
          <p>
            Last verified {fmtMult(state.verifiedFactor)} · ${fmtPrice8(state.price)} per economic
            share. Canonical payload bytes are unavailable here.
          </p>
        </div>
        <div>
          <span>03 / ATTESTATION</span>
          <strong>{attestationTx ? "Receipt captured" : "Session receipt missing"}</strong>
          <p>
            Configured attester {shortHex(state.roles?.attester ?? "Unavailable")}.{" "}
            {attestationTx ? (
              <HexLink hex={attestationTx.hash} url={attestationTx.url} />
            ) : (
              "Run the attestation step in this page session to capture its receipt."
            )}
          </p>
        </div>
      </div>
      <div className="dossier-event-path">
        <span>INDEXED REGISTRY PATH / CHRONOLOGICAL</span>
        <div className="dossier-event-track">
          {ordered.length ? (
            ordered.map((event, i) => (
              <div className="dossier-event-node" key={event.id}>
                <i />
                <span>
                  {String(i + 1).padStart(2, "0")} · {event.event_name}
                </span>
                <small>
                  block {event.block_number} · log {event.log_index}
                </small>
                <HexLink hex={event.tx_hash} url={event.txUrl} />
              </div>
            ))
          ) : (
            <div className="dossier-evidence-gap">
              Evidence gap ·{" "}
              {eventError
                ? "indexed event read unavailable"
                : "no registry events indexed for this action in the current API view"}
              .
            </div>
          )}
        </div>
      </div>
      <p className="dossier-assembly-foot">
        This is an unsigned page-session assembly. Full state, execution receipts, expected
        simulated rejections and export remain available below.
      </p>
    </section>
  );
}
