import { Link } from "react-router-dom";
import { LimitExceededError } from "../../api/client";

const LIMIT_MESSAGES: Record<string, string> = {
  ai_message: "You have used all AI messages in your plan for this period.",
  upload: "You have reached the upload limit in your plan for this period.",
  storage: "This file would go past the storage limit in your plan.",
  document_scope: "Your plan limits how many documents one conversation can include.",
  chat_model: "Quality answers are available on the Pro plan.",
  folder_chat: "Folder chat is available on the Pro plan.",
  file_size: "Max file size is 20 MB for the free plan. Upgrade your plan to upload files up to 50 MB."
};

export function limitExceededMessage(error: LimitExceededError) {
  return LIMIT_MESSAGES[error.kind] ?? "You have reached a limit in your plan.";
}

export function LimitExceededNotice({ error }: { error: LimitExceededError }) {
  return (
    <span>
      {limitExceededMessage(error)}{" "}
      <Link to="/app/billing" className="font-semibold text-red-700 underline hover:no-underline">
        Upgrade your plan
      </Link>
    </span>
  );
}
