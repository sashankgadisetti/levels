/** [RE-EVALUATE] on the Status screen: runs the weekly re-evaluation and opens its approval window. */
import { useState } from "react";
import { runReevaluation } from "../../agent/reevaluate";
import { useUi } from "../../store/ui";
import { Btn } from "../ui/kit";

export function ReevaluateButton() {
  const [busy, setBusy] = useState(false);
  const toast = useUi((u) => u.showToast);
  const run = async () => {
    setBusy(true);
    try {
      const r = await runReevaluation();
      if (!r.ok) toast(r.text || "Re-evaluation failed.");
      else if (r.via === "heuristic" && r.agent && r.agent.stopped !== "no_key" && r.agent.stopped !== "disabled") toast("Claude unavailable: offline re-evaluation shown.");
    } catch (err) {
      toast(`Re-evaluation failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Btn sm disabled={busy} onClick={() => void run()} title="Review the last week and propose next week's targets and Gate" data-testid="reevaluate">
      {busy ? "[EVALUATING…]" : "[RE-EVALUATE]"}
    </Btn>
  );
}
