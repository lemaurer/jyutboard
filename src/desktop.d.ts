export {};
declare global {
  interface Window {
    desktop?: {
      web?: boolean;
      updates?: {
        get: () => Promise<import("./updateState").UpdateState>;
        check: () => Promise<import("./updateState").UpdateState>;
        enabled: (
          value: boolean,
        ) => Promise<import("./updateState").UpdateState>;
        install: () => Promise<boolean>;
      };
      copyText?: (text: string) => Promise<boolean>;
      vocabulary: () => Promise<{
        known: string[];
        queued: string[];
        at: number;
      }>;
      recognize?: (image: string) => Promise<{ chinese: string }>;
      transcribe: (audio: string) => Promise<{ transcript: string }>;
      pair: (value: {
        action: "get" | "remember" | "publish" | "resolve" | "forget";
        room?: string;
        relay?: string;
        host?: boolean;
      }) => Promise<{ room?: string; host?: boolean; relay?: string } | null>;
      getSettings: () => Promise<{
        queueUrl: string;
        hasQueueToken: boolean;
        hasGoogleKey: boolean;
      }>;
      saveSettings: (value: {
        queueUrl: string;
        queueToken: string;
        googleKey: string;
      }) => Promise<boolean>;
      clearSettings: () => Promise<boolean>;
      host: () => Promise<{ local: string; addresses: string[] }>;
      hostRemote: () => Promise<{ url: string }>;
      stopRemote: () => Promise<boolean>;
      analyze?: (
        text: string,
        language: "chinese" | "jyutping" | "english",
      ) => Promise<{
        chinese: string;
        jyutping: string;
        definition: string;
        words: { chinese: string; jyutping: string; definition: string }[];
      }>;
      translate: (text: string) => Promise<string>;
      send: (payload: unknown) => Promise<unknown>;
      microphone: () => Promise<boolean>;
      saveBackup: (text: string) => Promise<boolean>;
    };
  }
}
