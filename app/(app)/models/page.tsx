import { ActionButton } from "@/components/actions";
import { Banner, Chip, Empty, PageHeader } from "@/components/kit";
import { ModelAdd } from "@/components/model-add";
import { listPlatformModels } from "@/lib/server/data";
import { listModels } from "@/lib/server/openrouter";
import { requireUser } from "@/lib/server/supabase";

const price = (value: number | null) => (value === null ? "—" : `$${value.toFixed(value < 1 ? 3 : 2)}`);

export default async function ModelsPage() {
  const { supabase } = await requireUser();
  const [platform, catalogue] = await Promise.all([listPlatformModels(supabase), listModels()]);
  const info = new Map(catalogue.map((model) => [model.id, model]));
  const onPlatform = new Set(platform.map((model) => model.id));
  const addable = catalogue
    .filter((model) => !onPlatform.has(model.id) && model.inputPrice !== null && model.outputPrice !== null)
    .sort((a, b) => a.inputPrice! + 3 * a.outputPrice! - (b.inputPrice! + 3 * b.outputPrice!))
    .map((model) => ({ id: model.id, label: `${price(model.inputPrice)} / ${price(model.outputPrice)}` }));

  return (
    <>
      <PageHeader eyebrow="Library" title="Models" description="The models this workspace may call. Runs and LLM judges are refused for anything not listed here, so this list is also your cost ceiling." />
      {catalogue.length === 0 ? <div className="mb-4"><Banner tone="warn" title="OpenRouter catalogue unavailable">Prices are hidden and models cannot be added until it is reachable again.</Banner></div> : null}
      <ModelAdd catalogue={addable} />
      {platform.length === 0 ? <Empty title="No models yet">Add at least one model before running an eval.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Model</th><th className="th">Input / 1M</th><th className="th">Output / 1M</th><th className="th">Context</th><th className="th" /></tr></thead>
            <tbody>
              {platform.map((model) => {
                const details = info.get(model.id);
                return (
                  <tr key={model.id}>
                    <td className="td"><span className="font-mono text-xs">{model.id}</span>{model.is_default ? <> <Chip tone="accent">default</Chip></> : null}{catalogue.length && !details ? <> <Chip tone="bad" title="No longer in the OpenRouter catalogue">unlisted</Chip></> : null}<p className="hint">{details?.name}</p></td>
                    <td className="td tabular-nums">{price(details?.inputPrice ?? null)}</td>
                    <td className="td tabular-nums">{price(details?.outputPrice ?? null)}</td>
                    <td className="td text-xs text-ink-2 tabular-nums">{details?.contextLength?.toLocaleString() ?? "—"}</td>
                    <td className="td text-right whitespace-nowrap">
                      {model.is_default ? null : <ActionButton path="/api/models" method="PUT" body={{ id: model.id }} label="Make default" />}{" "}
                      <ActionButton path="/api/models" method="DELETE" body={{ id: model.id }} label="Remove" confirmText={`Remove ${model.id}? Evals that use it will be refused until it is added back or swapped out. Past results are kept.`} className="btn btn-ghost btn-sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
