import { MessagesPath, MessagesReducer } from '@/app/components/messages/store';
import { StorePath, StoreReducer } from '@/app/components/messages/store/storeIndex';
import { BookingsPath, BookingsReducer } from '@/app/components/messages/store/stubs';
import { BusinessPath, BusinessReducer } from '@/app/components/messages/store/stubs';
import { UserPath, UserReducer } from '@/app/components/messages/store/stubs';
import { configureStore } from '@reduxjs/toolkit';
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

export const store = configureStore({
  reducer: {
    [MessagesPath]: MessagesReducer,
    [BookingsPath]: BookingsReducer,
    [BusinessPath]: BusinessReducer,
    [StorePath]: StoreReducer,
    [UserPath]: UserReducer,
  },
});

export type StateType = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<StateType> = useSelector;
