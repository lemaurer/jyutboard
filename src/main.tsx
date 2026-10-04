import { installWebRuntime } from "./webRuntime";
import { registerPWA, installTabletViewport } from "./pwa";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div style={{ padding: 40 }}>
        <h1>The teaching desk needs to reopen.</h1>
        <p>Your local lessons have not been removed.</p>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>Reopen</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
installWebRuntime();
registerPWA();
installTabletViewport();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
