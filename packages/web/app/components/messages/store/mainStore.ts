import { BookingsPath, BookingsReducer } from '@reducers/bookings';
import { BusinessPath, BusinessReducer } from '@reducers/business';
import { MessagesPath, MessagesReducer } from '@reducers/messages';
import { StorePath, StoreReducer } from '@reducers/store';
import { UserPath, UserReducer } from '@reducers/user';
import { configureStore } from '@reduxjs/toolkit';
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import { cartSyncMiddleware } from './middleware/cartSyncMiddleware';

export const store = configureStore({
  reducer: {
    [MessagesPath]: MessagesReducer,
    [BookingsPath]: BookingsReducer,
    [BusinessPath]: BusinessReducer,
    [StorePath]: StoreReducer,
    [UserPath]: UserReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(cartSyncMiddleware),
});

export type StateType = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<StateType> = useSelector;
