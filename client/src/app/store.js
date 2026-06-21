import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import resetPasswordReducer from './resetPasswordSlice';
import transactionReducer from './transactionSlice';
import goalReducer from './goalSlice';
import reminderReducer from './reminderSlice';
import chatReducer from './chatSlice';
import vaultReducer from './vaultSlice';
import budgetReducer from './budgetSlice';
import notificationReducer from './notificationSlice';

// chatService uses WebSocket — needs token/userId getters
import { setTokenGetter as setChatTokenGetter, setUserIdGetter as setChatUserIdGetter } from '../services/chatService';

const store = configureStore({
    reducer: {
        auth: authReducer,
        passwordReset: resetPasswordReducer,
        transaction: transactionReducer,
        goals: goalReducer,
        reminder: reminderReducer,
        chat: chatReducer,
        vault: vaultReducer,
        budget: budgetReducer,
        notifications: notificationReducer,
    }
});

const tokenGetter = () => store.getState().auth.accessToken;
const userIdGetter = () => {
    const user = store.getState().auth?.user;
    return user?.id || user?.userId || user?._id || null;
};

// All main backend HTTP services use shared apiClient from axiosConfigs (no token getter needed)
// Only these two services need explicit token wiring:
setChatTokenGetter(tokenGetter);
setChatUserIdGetter(userIdGetter);
// setAnalyticsTokenGetter(tokenGetter);
// setAnalyticsTokenExpiredHandler(() => {
//     // Analytics token expired — axiosConfigs will handle refresh for main backend
//     // Nothing extra needed here
// });

export { store };