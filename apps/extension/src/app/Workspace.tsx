/**
 * Connected workspace shell: sidebar, page area, and status bar.
 */
import { osLabel } from "../shared/platform";
import type { HelloResult } from "../shared/protocol";
import { QuireMark } from "../shared/QuireMark";
import { StatusBar } from "./StatusBar";

/**
 * Render the workspace for a connected helper.
 */
export function Workspace({ hello }: { hello: HelloResult }) {
  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar__header">
          <QuireMark size={20} />
          <span className="sidebar__name">Quire</span>
        </div>
      </aside>
      <main className="page">
        <div className="page__content">
          <h1 className="page__title">Quire Helper is connected</h1>
          <p className="page__lead">
            {`Quire Helper ${hello.helperVersion} is running on ${osLabel(hello.os)} (${hello.arch}).`}
          </p>
        </div>
      </main>
      <StatusBar hello={hello} />
    </div>
  );
}
