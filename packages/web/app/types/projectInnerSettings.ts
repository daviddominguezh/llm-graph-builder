export enum PROJECT_PLAN {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
}

export enum COLLABORATOR_ROLE {
  AGENT = 'agent',
  ADMIN = 'admin',
  OWNER = 'owner',
}

export enum COLLABORATOR_STATUS {
  PENDING = 'pending',
  ACTIVE = 'active',
}

export interface TimeRange {
  start: string; // HH:mm format
  end: string; // HH:mm format
}

export interface ScheduleTemplate {
  id: string; // Unique identifier for the schedule
  name: string; // e.g., "Morning Shift", "Full Day", "Weekend Only"
  worksOnPublicHolidays: boolean;
  workingDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
  weekdaySchedules: {
    monday: TimeRange[];
    tuesday: TimeRange[];
    wednesday: TimeRange[];
    thursday: TimeRange[];
    friday: TimeRange[];
    saturday: TimeRange[];
    sunday: TimeRange[];
  };
  sameScheduleForHolidays: boolean;
  holidaySchedules: TimeRange[]; // Used when sameScheduleForHolidays is false
}

export interface Collaborator {
  name: string;
  role: COLLABORATOR_ROLE;
  email: string;
  status: COLLABORATOR_STATUS;
  profilePic?: string; // URL to profile picture
  scheduleEnabled?: boolean; // Controls message reception
  scheduleId?: string; // Reference to a ScheduleTemplate
}

export interface InnerSettings {
  projectPlan: PROJECT_PLAN;
  credits: number;
  creditsPrice: number;
  trafficPercentage: number;
  assignToAIWhenNooneIsAvailable?: boolean;
  collaborators: Collaborator[];
  scheduleTemplates?: ScheduleTemplate[]; // Available schedule templates
}
