import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type SubTier = 'free' | 'pro';

interface SubscriptionState {
  tier: SubTier;
  loading: boolean;
  isPro: boolean;
  isFree: boolean;
  /* Limits for the free tier */
  mockTestLimit: number;
  bookmarkLimit: number;
}

const FREE_LIMITS = {
  mockTestLimit: 5,
  bookmarkLimit: 20,
};

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubTier>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTier('free');
      setLoading(false);
      return;
    }

    async function fetchSubscription() {
      const { data } = await supabase
        .from('subscriptions')
        .select('status, plans!inner(code)')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .maybeSingle();

      if (data) {
        const planCode = (data as any).plans?.code ?? '';
        setTier(planCode.startsWith('pro') ? 'pro' : 'free');
      } else {
        setTier('free');
      }
      setLoading(false);
    }

    fetchSubscription();
  }, [user]);

  return {
    tier,
    loading,
    isPro: tier === 'pro',
    isFree: tier === 'free',
    mockTestLimit: tier === 'pro' ? Infinity : FREE_LIMITS.mockTestLimit,
    bookmarkLimit: tier === 'pro' ? Infinity : FREE_LIMITS.bookmarkLimit,
  };
}
