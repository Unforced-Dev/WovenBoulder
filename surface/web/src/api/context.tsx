/**
 * Client dependency injection: the app provides the real client once;
 * pages/components consume it via `useClient()`. Tests provide fakes.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { WovenBoulderClient } from "./client.ts";

const ClientContext = createContext<WovenBoulderClient | null>(null);

export function ClientProvider(props: {
  client: WovenBoulderClient;
  children: ReactNode;
}) {
  return (
    <ClientContext.Provider value={props.client}>
      {props.children}
    </ClientContext.Provider>
  );
}

export function useClient(): WovenBoulderClient {
  const client = useContext(ClientContext);
  if (client === null) {
    throw new Error("useClient must be used inside a <ClientProvider>");
  }
  return client;
}
