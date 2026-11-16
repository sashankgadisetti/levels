/**
 * Settings → Agent: the daily budget shared with the Oracle and its spend meter, which parser the
 * quick bar uses, and the local API (MCP) status with a copyable Claude Desktop config snippet.
 */
import { useEffect, useState } from "react";
import { agentClaudeEnabled, agentSpentTodayUsd, setAgentClaudeEnabled, sharedSpentTodayUsd } from "../../agent/budget";
import { getLocalApiInfo, type LocalApiInfo } from "../../lib/bridge";
import { isTauri } from "../../lib/tauri";
import { getOracleApiKey } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Btn, Field, Panel, SBar, Toggle } from "../ui/kit";

export const MCP_CONFIG_SNIPPET = JSON.stringify(
  { mcpServers: { levels: { command: "node", args: ["/ABS/PATH/levels/mcp/dist/index.js"] } } },
  null,
  2,
);

export function AgentSettings({ budgetUsd }: { budgetUsd: number }) {
  const toast = useUi((u) => u.showToast);
  const [useClaude, setUseClaude] = useState(agentClaudeEnabled);
  const [hasKey, setHasKey] = useState(false);
  const [api, setApi] = useState<LocalApiInfo | null | undefined>(undefined);
  const spent = sharedSpentTodayUsd();
  const agentSpent = agentSpentTodayUsd();
  const overBudget = budgetUsd > 0 ? spent >= budgetUsd : true;

  useEffect(() => {
    void getOracleApiKey().then((k) => setHasKey(!!k));
    void getLocalApiInfo().then(setApi);
  }, []);

  const parser = useClaude && hasKey && !overBudget ? "Claude (claude-haiku-5-5)" : "Regex (offline)";
  const parserWhy = !useClaude ? "Claude is switched off for agent features." : !hasKey ? "No API key saved (Oracle tab)." : overBudget ? "Today's budget is spent." : "Falls back to the offline parser on any error.";

  const copy = async () => {
    try { await navigator.clipboard.writeText(MCP_CONFIG_SNIPPET); toast("MCP config copied"); }
    catch { toast("Copy failed"); }
  };

  return (
    <Panel title="Agent">
      <p className="copy mb-1">The agent logs free text from the quick bar (Ctrl/Cmd+J), runs the weekly re-evaluation, and answers Claude Desktop through the local API. Plan changes always wait for your ACCEPT.</p>
      <Field label="Use Claude" hint="Off: the quick bar and re-evaluation work offline."><Toggle on={useClaude} onChange={(v) => { setUseClaude(v); setAgentClaudeEnabled(v); }} label="Use Claude for agent features" /></Field>
      <Field label="Daily budget" hint="Shared with the Oracle; change it in the Oracle tab."><span className="mono tone-gold">${budgetUsd.toFixed(2)}</span></Field>
      <Field label="Spent today" hint={`Agent share: $${agentSpent.toFixed(3)}`}><div className="grid w-full items-center gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <SBar value={spent} max={Math.max(budgetUsd, 0.01)} tone={overBudget && budgetUsd > 0 ? "red" : "gold"} thin numbers={false} />
        <span className="mono tone-gold" data-testid="agent-spend">${spent.toFixed(3)} / ${budgetUsd.toFixed(2)}</span>
      </div></Field>
      <Field label="Quick bar parses with" hint={parserWhy}><span className="mono tone-cyan" data-testid="agent-parser">{parser}</span></Field>
      <Field label="MCP status" hint="For Claude Desktop / Claude Code (see mcp/README.md).">
        <div className="grid gap-2">
          <span className="copy !text-[15px]" data-testid="mcp-status">
            {api ? <>Local API: listening on port <span className="mono">{api.port}</span> · token at <span className="mono break-all">{api.tokenPath}</span></>
              : api === undefined ? "Checking…" : isTauri() ? "Local API is not running." : "Local API runs in the desktop app only."}
          </span>
          <div><Btn sm onClick={() => void copy()} title={MCP_CONFIG_SNIPPET}>[COPY CLAUDE DESKTOP CONFIG]</Btn></div>
        </div>
      </Field>
    </Panel>
  );
}
