import { describe, expect, it } from 'vitest'
import { planOffer } from './subscriptionPlans'

describe('planOffer', () => {
  it('monthly checks out the tier itself', () => {
    expect(planOffer('operational', 'monthly')).toEqual({
      productId: 'operational',
      price: 20,
      priceLabel: '$20/month',
      billingNote: 'Billed monthly',
    })
  })

  it('annual is a separate product at twelve monthly prices', () => {
    expect(planOffer('operational', 'annual')).toMatchObject({ productId: 'operational_annual', price: 240, priceLabel: '$240/year' })
    expect(planOffer('business', 'annual')).toMatchObject({
      productId: 'business_annual',
      price: 1188,
      priceLabel: '$1,188/year',
      billingNote: 'Billed annually — $99/month',
    })
  })

  it('Enterprise has no self-serve offer', () => {
    expect(planOffer('enterprise', 'monthly')).toBeNull()
    expect(planOffer('enterprise', 'annual')).toBeNull()
  })
})
