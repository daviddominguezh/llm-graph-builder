import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Bot, GitBranch } from "lucide-react";

const iconStyle = "h-4 w-4 text-muted-foreground";
const decisionIcon = <GitBranch className={iconStyle} />;
const agentIcon = <Bot className={iconStyle} />;

interface NodeHeaderProps {
  isDecision: boolean;
  agent?: string;
}

const NodeHeaderComponent = ({ isDecision, agent }: NodeHeaderProps) => {
  const headerLabel = isDecision ? "Decision Node" : "Agent Node";
  const headerIcon = isDecision ? decisionIcon : agentIcon;

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      {headerIcon}
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {headerLabel}
      </span>
      {agent && (
        <Badge
          variant="outline"
          className="ml-auto border-secondary bg-white uppercase"
        >
          {agent}
        </Badge>
      )}
    </div>
  );
};

export const NodeHeader = memo(NodeHeaderComponent, (prev, next) =>
  prev.isDecision === next.isDecision && prev.agent === next.agent
);
