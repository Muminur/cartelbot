"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { getErrorRemediationSteps, FailureReason } from "@/lib/utils/error-categorization";

interface ErrorDetailCardProps {
  error: string;
  errorCode?: string;
  timestamp?: Date;
  failureReason?: FailureReason | string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDetailCard({
  error,
  errorCode,
  timestamp,
  failureReason,
  onRetry,
  className = "",
}: ErrorDetailCardProps) {
  // Get remediation steps if failure reason is provided
  const remediationSteps = failureReason
    ? getErrorRemediationSteps(failureReason as FailureReason)
    : [];

  return (
    <div className={`bg-red-50 p-4 rounded-lg border border-red-200 space-y-3 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 text-sm">Trade Execution Failed</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>

          {(errorCode || failureReason) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {errorCode && (
                <Badge variant="destructive" className="text-xs">
                  {errorCode}
                </Badge>
              )}
              {failureReason && (
                <Badge variant="outline" className="text-xs border-red-300 text-red-700">
                  {failureReason.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>
          )}

          {timestamp && (
            <p className="text-xs text-red-600 mt-2">
              Occurred: {new Date(timestamp).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {remediationSteps.length > 0 && (
        <div className="border-t border-red-200 pt-3">
          <p className="text-xs font-semibold text-red-900 mb-2">Recommended Actions:</p>
          <ul className="text-xs text-red-700 space-y-1 ml-4 list-disc">
            {remediationSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}

      {onRetry && (
        <div className="border-t border-red-200 pt-3">
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="text-red-700 border-red-300 hover:bg-red-100 h-10 md:h-9 text-base md:text-sm"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Retry Execution
          </Button>
        </div>
      )}
    </div>
  );
}
