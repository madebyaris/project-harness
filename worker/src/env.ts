export type HyperdriveBinding = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
};

export type Env = {
  MCP_TOKEN: string;
  HYPERDRIVE?: HyperdriveBinding;
  TIDB_CONNECTION_STRING?: string;
};
