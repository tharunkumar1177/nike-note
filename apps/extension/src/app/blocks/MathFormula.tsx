/**
 * Rendered TeX (see blueprints/rich-blocks.md): inline math in text and
 * block equations shown read-only, as inside a toggle. While KaTeX loads the
 * TeX itself is shown, and TeX KaTeX cannot read is shown in red with the
 * reason in its tooltip.
 */
import type { Block } from "@quire/markdown";

import { EquationIcon } from "../../shared/icons";
import { useRenderedMath } from "../math/mathStore";

/**
 * TeX `tex` as display math (`display`, a block of its own) or inline math.
 */
export function MathFormula({ tex, display }: { tex: string; display: boolean }) {
  const result = useRenderedMath(tex, display);
  const Tag = display ? "div" : "span";
  const base = display ? "math math--display" : "math math--inline";
  if (result.status === "ready") {
    return <Tag className={base} dangerouslySetInnerHTML={{ __html: result.html }} />;
  }
  if (result.status === "error") {
    return (
      <Tag className={`${base} math--error`} title={result.message}>
        {tex}
      </Tag>
    );
  }
  return <Tag className={`${base} math--pending`}>{tex}</Tag>;
}

/** The hint an equation without TeX shows in its place. */
export function EmptyEquation() {
  return (
    <span className="math-empty">
      <EquationIcon />
      Add a TeX equation
    </span>
  );
}

/** Equation `block` shown read-only and centered. */
export function MathView({ block }: { block: Extract<Block, { type: "math" }> }) {
  return (
    <div className="block block--math">
      {block.tex.trim() === "" ? <EmptyEquation /> : <MathFormula tex={block.tex} display />}
    </div>
  );
}
