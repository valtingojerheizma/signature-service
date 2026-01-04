import Stripe from 'stripe';
import { prisma } from './db';
import { logger } from './logger';

// Initialize Stripe client
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

const PRICE_ID = process.env.STRIPE_PRICE_ID || '';

/**
 * Creates a Stripe checkout session for upgrading to Pro.
 */
export async function createCheckoutSession(
  tenantId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const billing = await prisma.billingAccount.findUnique({
    where: { tenantId },
    include: { tenant: true },
  });

  if (!billing) {
    throw new Error('Billing account not found');
  }

  // Create or get Stripe customer
  let customerId = billing.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { tenantId },
      email: billing.tenant.domain, // Will be updated with admin email
    });
    customerId = customer.id;

    await prisma.billingAccount.update({
      where: { tenantId },
      data: { stripeCustomerId: customerId },
    });
  }

  // Get active user count for metered billing
  const activeUserCount = await prisma.employee.count({
    where: { tenantId, suspended: false },
  });

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: PRICE_ID,
        quantity: Math.max(1, activeUserCount),
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenantId },
    subscription_data: {
      metadata: { tenantId },
    },
  });

  return session.url || '';
}

/**
 * Creates a Stripe customer portal session for managing billing.
 */
export async function createPortalSession(
  tenantId: string,
  returnUrl: string
): Promise<string> {
  const billing = await prisma.billingAccount.findUnique({
    where: { tenantId },
  });

  if (!billing?.stripeCustomerId) {
    throw new Error('No Stripe customer found');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Handles Stripe webhook events.
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  const log = logger.child({ eventType: event.type, eventId: event.id });

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenantId;

      if (!tenantId) {
        log.warn('No tenant ID in subscription metadata');
        return;
      }

      const status = mapSubscriptionStatus(subscription.status);

      await prisma.billingAccount.update({
        where: { tenantId },
        data: {
          stripeSubscriptionId: subscription.id,
          plan: 'PRO',
          status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        },
      });

      log.info({ tenantId, status }, 'Updated subscription');
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenantId;

      if (!tenantId) {
        log.warn('No tenant ID in subscription metadata');
        return;
      }

      await prisma.billingAccount.update({
        where: { tenantId },
        data: {
          plan: 'TRIAL',
          status: 'CANCELLED',
          stripeSubscriptionId: null,
        },
      });

      log.info({ tenantId }, 'Subscription cancelled');
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId = invoice.subscription_details?.metadata?.tenantId;

      if (tenantId) {
        await prisma.billingAccount.update({
          where: { tenantId },
          data: { status: 'ACTIVE' },
        });
        log.info({ tenantId }, 'Payment succeeded');
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId = invoice.subscription_details?.metadata?.tenantId;

      if (tenantId) {
        await prisma.billingAccount.update({
          where: { tenantId },
          data: { status: 'PAST_DUE' },
        });
        log.info({ tenantId }, 'Payment failed');
      }
      break;
    }

    default:
      log.debug('Unhandled event type');
  }
}

function mapSubscriptionStatus(
  status: Stripe.Subscription.Status
): 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
    case 'unpaid':
      return 'CANCELLED';
    case 'incomplete':
    case 'incomplete_expired':
      return 'EXPIRED';
    default:
      return 'ACTIVE';
  }
}

/**
 * Checks if a tenant has an active subscription or trial.
 */
export async function checkBillingStatus(tenantId: string): Promise<{
  canDeploy: boolean;
  reason?: string;
}> {
  const billing = await prisma.billingAccount.findUnique({
    where: { tenantId },
  });

  if (!billing) {
    return { canDeploy: false, reason: 'No billing account' };
  }

  // Check trial status
  if (billing.plan === 'TRIAL') {
    if (billing.trialEndsAt && billing.trialEndsAt < new Date()) {
      return { canDeploy: false, reason: 'Trial expired' };
    }
    return { canDeploy: true };
  }

  // Check subscription status
  if (billing.status === 'ACTIVE') {
    return { canDeploy: true };
  }

  if (billing.status === 'PAST_DUE') {
    return { canDeploy: false, reason: 'Payment past due' };
  }

  return { canDeploy: false, reason: 'Subscription inactive' };
}
