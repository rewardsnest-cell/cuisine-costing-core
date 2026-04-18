import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmContextValue = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmContextValue>((options) => {
    setOpts(options || {});
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const finish = (value: boolean) => {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  };

  const destructive = opts.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) finish(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title || "Are you sure?"}</AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>
              {opts.cancelText || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finish(true)}
              className={
                destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {opts.confirmText || (destructive ? "Delete" : "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Safe fallback so a missing provider never crashes a delete flow.
    return async (options) =>
      typeof window !== "undefined"
        ? window.confirm(
            (options?.title || "Are you sure?") +
              (typeof options?.description === "string" ? `\n\n${options.description}` : ""),
          )
        : true;
  }
  return ctx;
}
