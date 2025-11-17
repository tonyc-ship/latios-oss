import { supabase } from './supabase';

/**
 * User action type definitions
 */
export enum UserActionType {
  // Stripe related
  STRIPE_SUBSCRIPTION_CREATED = 'stripe_subscription_created',
  STRIPE_SUBSCRIPTION_CANCELED = 'stripe_subscription_canceled',
  STRIPE_SUBSCRIPTION_REACTIVATED = 'stripe_subscription_reactivated',
  STRIPE_SUBSCRIPTION_DELETED = 'stripe_subscription_deleted',
  STRIPE_SUBSCRIPTION_FAILED = 'stripe_subscription_failed',
  
  // WeChat related
  WECHAT_PAYMENT_SUCCESS = 'wechat_payment_success',
  
  // Invitation code related
  INVITATION_CODE_USED = 'invitation_code_used',
}

/**
 * User action record interface
 */
export interface UserActionData {
  userId?: string | null;
  actionType: string;
  targetId?: string | null;
  targetType?: string | null;
  actionDetails?: any;
  ipAddress?: string | null;
  deviceInfo?: any;
}

/**
 * Unified user action logging service
 * Used to log user actions to the tbl_user_action table
 */
export class UserActionService {
  /**
   * Log user action to database
   * @param actionData Action data
   * @returns Promise<boolean> Whether successful
   */
  static async logAction(actionData: UserActionData): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      
      const prepareData = {
        user_id: actionData.userId || null,
        action_type: actionData.actionType,
        target_id: actionData.targetId || null,
        target_type: actionData.targetType || null,
        action_details: actionData.actionDetails || null,
        device_info: actionData.deviceInfo || null,
        ip_address: actionData.ipAddress || null,
        create_user_id: actionData.userId || null,
        update_user_id: actionData.userId || null,
        create_time: now,
        update_time: now,
        delete_status: 1,
      };

      console.log('[UserActionService] Logging user action:', {
        actionType: prepareData.action_type,
        userId: prepareData.user_id,
        targetType: prepareData.target_type,
      });

      const { data: actionRecord, error } = await supabase
        .from('tbl_user_action')
        .insert(prepareData)
        .select()
        .single();

      if (error) {
        console.error('[UserActionService] Error logging user action:', error);
        return false;
      }

      console.log('[UserActionService] Successfully logged user action:', actionRecord?.id);
      return true;
    } catch (error) {
      console.error('[UserActionService] Exception while logging user action:', error);
      return false;
    }
  }

  /**
   * Log Stripe subscription creation
   */
  static async logStripeSubscriptionCreated(
    userId: string,
    subscriptionId: string,
    planType: string,
    amount: number,
    details?: any
  ): Promise<boolean> {
    return this.logAction({
      userId,
      actionType: UserActionType.STRIPE_SUBSCRIPTION_CREATED,
      targetId: subscriptionId,
      targetType: 'subscription',
      actionDetails: {
        planType,
        amount,
        ...details,
      },
    });
  }

  /**
   * Log Stripe subscription cancellation
   */
  static async logStripeSubscriptionCanceled(
    userId: string,
    subscriptionId: string,
    details?: any
  ): Promise<boolean> {
    return this.logAction({
      userId,
      actionType: UserActionType.STRIPE_SUBSCRIPTION_CANCELED,
      targetId: subscriptionId,
      targetType: 'subscription',
      actionDetails: details,
    });
  }

  /**
   * Log Stripe subscription reactivation
   */
  static async logStripeSubscriptionReactivated(
    userId: string,
    subscriptionId: string,
    details?: any
  ): Promise<boolean> {
    return this.logAction({
      userId,
      actionType: UserActionType.STRIPE_SUBSCRIPTION_REACTIVATED,
      targetId: subscriptionId,
      targetType: 'subscription',
      actionDetails: details,
    });
  }

  /**
   * Log Stripe subscription deletion
   */
  static async logStripeSubscriptionDeleted(
    userId: string,
    subscriptionId: string,
    details?: any
  ): Promise<boolean> {
    return this.logAction({
      userId,
      actionType: UserActionType.STRIPE_SUBSCRIPTION_DELETED,
      targetId: subscriptionId,
      targetType: 'subscription',
      actionDetails: details,
    });
  }

  /**
   * Log Stripe subscription failure
   */
  static async logStripeSubscriptionFailed(
    userId: string,
    subscriptionId: string,
    failureReason?: string,
    details?: any
  ): Promise<boolean> {
    return this.logAction({
      userId,
      actionType: UserActionType.STRIPE_SUBSCRIPTION_FAILED,
      targetId: subscriptionId,
      targetType: 'subscription',
      actionDetails: {
        failureReason,
        ...details,
      },
    });
  }

  /**
   * Log WeChat payment success
   */
  static async logWechatPaymentSuccess(
    userId: string,
    orderId: string,
    transactionId: string,
    amount: number,
    details?: any
  ): Promise<boolean> {
    return this.logAction({
      userId,
      actionType: UserActionType.WECHAT_PAYMENT_SUCCESS,
      targetId: orderId,
      targetType: 'payment',
      actionDetails: {
        transactionId,
        amount,
        ...details,
      },
    });
  }

  /**
   * Log invitation code usage
   */
  static async logInvitationCodeUsed(
    userId: string,
    codeId: string,
    code: string,
    codeType: string,
    details?: any
  ): Promise<boolean> {
    return this.logAction({
      userId,
      actionType: UserActionType.INVITATION_CODE_USED,
      targetId: codeId,
      targetType: 'invitation_code',
      actionDetails: {
        code,
        codeType,
        ...details,
      },
    });
  }
}

