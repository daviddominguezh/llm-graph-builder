export type MerchantType = 'needs_improvement' | 'doing_well';

export interface RecoverableBreakdown {
  /** Merchant never responded */
  noResponse: number;
  /** Merchant responded too slowly */
  slowResponse: number;
  /** Conversation started outside business hours */
  afterHours: number;
  /** Customer spoke last with buying intent */
  leftHanging: number;
}

export interface AfterHoursCoverage {
  /** Number of conversations that started outside business hours */
  conversationsOutsideBusinessHours: number;
  /** Top 3 after-hours hours with most activity */
  peakAfterHours: number[];
  /** Detected business hours (for reference) */
  detectedBusinessHours: number[];
}

export interface TimeSavedDetails {
  /** Estimated hours saved per week */
  hours: number;
  /** Calculation basis */
  basedOn: {
    /** Questions per week that could be automated */
    automatableQuestionsPerWeek: number;
    /** Average minutes to respond */
    avgMinutesPerResponse: number;
  };
}

export interface CloserValue {
  /** Merchant performance classification */
  merchantType: MerchantType;

  /** Conversations that could have been saved */
  recoverableConversations: {
    count: number;
    breakdown: RecoverableBreakdown;
  };

  /** Time that could be saved weekly */
  timeSavedWeekly: TimeSavedDetails;

  /** After-hours coverage opportunity */
  afterHoursCoverage: AfterHoursCoverage;

  /** Conditional value pitch based on merchant type */
  valueSummary: string;
}

export interface ChatAuditReport {
  // Metadata
  /** Timestamp when report was generated */
  generatedAt: number;
  /** Namespace/project ID */
  namespace: string;
  /** Number of conversations analyzed */
  analyzedConversations: number;
  /** Date range of analyzed conversations */
  dateRange: {
    from: number;
    to: number;
  };

  // Executive Summary (from LLM)
  /** Brief summary highlighting key findings */
  executiveSummary: string;

  // Response Time Analysis
  responseTime: {
    /** Average response time in minutes */
    average: number;
    /** Response time by hour (24 values) */
    byHour: number[];
    /** 7x24 heatmap matrix */
    heatmap: number[][];
    /** Top 3 peak hours */
    peakHours: number[];
    /** LLM analysis of response times */
    analysis: {
      severity: 'critical' | 'warning' | 'acceptable';
      summary: string;
      worstHours: number[];
      recommendation: string;
    };
  };

  // Sales Funnel
  funnel: {
    totalConversations: number;
    leads: number;
    customers: number;
    conversionRate: number;
    messagesToClose: number;
    messagesToDeath: number;
  };

  // Pattern Insights
  patterns: {
    objectionFrequency: Record<string, number>;
    objectionKillRate: Record<string, number>;
    questionFrequency: Record<string, number>;
    dropOffDistribution: Record<string, number>;
    abandonmentReasons: Record<string, number>;
    lastSpeakerWhenAbandoned: {
      customer: number;
      merchant: number;
    };
  };

  // LLM-Generated Insights
  insights: {
    topSalesKillers: Array<{
      reason: string;
      impactDescription: string;
      recommendation: string;
    }>;
    oneMoreMessageOpportunities: {
      count: number;
      description: string;
      exampleConversationIds: string[];
      recommendedFollowup: string;
    };
    objectionPlaybook: Array<{
      objection: string;
      frequency: number;
      killRate: number;
      suggestedResponse: string;
    }>;
    faqAutomationCandidates: Array<{
      questionType: string;
      frequency: number;
      suggestedAutoResponse: string;
    }>;
  };

  // Closer Value Proposition
  closerValue: CloserValue;
}
