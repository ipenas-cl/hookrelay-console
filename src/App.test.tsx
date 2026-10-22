import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { MockClient } from "./api";

describe("App", () => {
  it("shows stats and all deliveries", async () => {
    render(<App client={new MockClient()} refreshMs={0} mock />);
    await waitFor(() => expect(screen.getByTestId("stat-dead")).toHaveTextContent("2"));
    expect(screen.getByText("mock mode")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(11); // header + 10
  });

  it("filters the DLQ, replays an event and updates counts", async () => {
    const user = userEvent.setup();
    render(<App client={new MockClient()} refreshMs={0} />);
    await user.click(await screen.findByRole("tab", { name: "Dead letter" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: "replay 4" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Delivery #4 re-queued");
    await waitFor(() => expect(screen.getByTestId("stat-dead")).toHaveTextContent("1"));
    expect(screen.getByTestId("stat-pending")).toHaveTextContent("3");
  });

  it("replays the whole DLQ", async () => {
    const user = userEvent.setup();
    render(<App client={new MockClient()} refreshMs={0} />);
    await user.click(await screen.findByRole("tab", { name: "Dead letter" }));
    await user.click(await screen.findByRole("button", { name: "Replay all dead" }));
    await waitFor(() => expect(screen.getByTestId("stat-dead")).toHaveTextContent("0"));
    expect(screen.getByText("No deliveries")).toBeInTheDocument();
  });

  it("opens a detail drawer with pretty payload and last error", async () => {
    const user = userEvent.setup();
    render(<App client={new MockClient()} refreshMs={0} />);
    await user.click(await screen.findByTestId("row-7"));
    const drawer = screen.getByRole("complementary", { name: "delivery detail" });
    expect(within(drawer).getByText(/422 Unprocessable Entity/)).toBeInTheDocument();
    expect(within(drawer).getByText(/whatsapp_business_account/)).toBeInTheDocument();
  });

  it("shows API errors", async () => {
    const broken = new MockClient();
    broken.stats = () => Promise.reject(new Error("hookrelay unreachable"));
    render(<App client={broken} refreshMs={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("hookrelay unreachable");
  });
});
