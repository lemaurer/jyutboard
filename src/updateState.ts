export type UpdateState = {
  version: string;
  enabled: boolean;
  phase:
    | "idle"
    | "development"
    | "checking"
    | "current"
    | "downloading"
    | "ready"
    | "installing"
    | "error";
  available?: string;
  progress?: number;
  error?: string;
};
