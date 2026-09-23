import { useEffect, useRef } from "react";
import { type ActionItem, type EventItem } from "../lib/api";
import { fmtTs, shortHex } from "../lib/format";
import { createSceneController } from "../lib/scene";

export function DossierAssembly({ action, events }: { action: ActionItem; events: EventItem[] }) {
  const root = useRef<HTMLElement>(null);
  const ordered = [...events].sort(
    (a, b) => a.block_number - b.block_number || a.log_index - b.log_index,
  );
  const submissionIndexed =
    !!action.txHash &&
    ordered.some((event) => event.tx_hash.toLowerCase() === action.txHash?.toLowerCase());

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const controller = createSceneController(
      element,
      (p) => {
        element.style.setProperty("--dossier-open", String(Math.min(1, p / 0.28)));
        element.style.setProperty(
          "--dossier-layers",
          String(Math.max(0, Math.min(1, (p - 0.2) / 0.42))),
        );
        element.style.setProperty(
          "--dossier-path",
          String(Math.max(0, Math.min(1, (p - 0.55) / 0.45))),
        );
      },
      { intro: 1, introOnView: true },
    );
    return () => controller.destroy();
  }, [action.actionId]);

  return (
    <section
      ref={root}
      className="dossier-assembly"
      aria-label="Evidence assembly for selected action"
    >
      <div className="dossier-source-row">
        <span>SELECTED LEDGER RECORD</span>
        <strong>{shortHex(action.actionId)}</strong>
        <span>{action.actionType}</span>
      </div>
      <div className="dossier-layers">
        <div>
          <span>01 / SOURCE FACTS</span>
          <strong>Observed {fmtTs(action.observedAt)}</strong>
          <p>
            Evidence hash <code title={action.evidenceHash}>{shortHex(action.evidenceHash)}</code>
          </p>
        </div>
        <div>
          <span>02 / CANONICAL EVENT</span>
          <strong>{action.actionType}</strong>
          <p>
            Parameters <code title={action.paramsHash}>{shortHex(action.paramsHash)}</code>
          </p>
        </div>
        <div>
          <span>03 / ATTESTATION</span>
          <strong>{action.attestedBy ? shortHex(action.attestedBy) : "Unavailable"}</strong>
          <p>{action.trust} identity · source truth requires independent review</p>
        </div>
      </div>
      <div className="dossier-event-path">
        <span>INDEXED REGISTRY PATH</span>
        <div className="dossier-event-track">
          {ordered.length ? (
            ordered.map((event, i) => (
              <div key={event.id} className="dossier-event-node">
                <i />
                <span>
                  {String(i + 1).padStart(2, "0")} · {event.event_name}
                </span>
                <small>
                  block {event.block_number} · log {event.log_index}
                </small>
              </div>
            ))
          ) : (
            <div className="dossier-evidence-gap">
              Evidence gap · no registry events indexed for this action.
            </div>
          )}
        </div>
        {action.txHash && !submissionIndexed && (
          <p className="dossier-evidence-gap">
            Evidence gap · the submission transaction is not present in the indexed event path.
          </p>
        )}
      </div>
      <p className="dossier-assembly-foot">
        The same record continues below with complete fields, copyable identifiers, raw evidence,
        ABI bytes and event references.
      </p>
    </section>
  );
}
