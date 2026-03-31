/**
 * Store stubs — placeholder Redux slices and selectors for features
 * that are not yet migrated (bookings, business, user).
 */
import type { StateType } from '@/app/components/messages/store/mainStore';
import type { BusinessSetupSchemaAPIType } from '@/app/types/business';
import { COLLABORATOR_ROLE } from '@/app/types/projectInnerSettings';
import { createSlice } from '@reduxjs/toolkit';

// ---------------------------------------------------------------------------
// Bookings slice stub
// ---------------------------------------------------------------------------
export const BookingsPath = 'bookings';

const bookingsSlice = createSlice({
  name: BookingsPath,
  initialState: {},
  reducers: {},
});

export const BookingsReducer = bookingsSlice.reducer;

// ---------------------------------------------------------------------------
// Business slice stub
// ---------------------------------------------------------------------------
export const BusinessPath = 'business';

interface BusinessState {
  setup: BusinessSetupSchemaAPIType | null;
}

const businessInitialState: BusinessState = { setup: null };

const businessSlice = createSlice({
  name: BusinessPath,
  initialState: businessInitialState,
  reducers: {},
});

export const BusinessReducer = businessSlice.reducer;

// ---------------------------------------------------------------------------
// User slice stub
// ---------------------------------------------------------------------------
export const UserPath = 'user';

interface UserState {
  projectName: string;
  projectRole: string;
}

const userInitialState: UserState = {
  projectName: '',
  projectRole: '',
};

const userSlice = createSlice({
  name: UserPath,
  initialState: userInitialState,
  reducers: {},
});

export const UserReducer = userSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const getBusinessSetup = (
  state: StateType
): BusinessSetupSchemaAPIType | null => {
  return (
    (state[BusinessPath] as BusinessState | undefined)?.setup ?? null
  );
};

export const selectCurrentProjectName = (
  state: StateType
): string => {
  return (
    (state[UserPath] as UserState | undefined)?.projectName ?? ''
  );
};

export const selectCurrentProjectRole = (
  state: StateType
): COLLABORATOR_ROLE | null => {
  const role = (state[UserPath] as UserState | undefined)?.projectRole;
  return (role as COLLABORATOR_ROLE) || null;
};
