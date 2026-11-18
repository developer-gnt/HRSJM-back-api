import {
  getReferralRewardYears,
  OFFICIAL_REFERRAL_TIERS,
} from './referral-reward.util';

describe('ReferralRewardUtil', () => {
  it('correctly maps District Unit to 1 Year', () => {
    const res = getReferralRewardYears('District Unit Post', 'DISTRICT_UNIT_POST');
    expect(res.rewardYears).toBe(1);
    expect(res.qualification).toContain('10th');
  });

  it('correctly maps State Unit to 2 Years', () => {
    const res = getReferralRewardYears('State Unit Post', 'STATE_UNIT_POST');
    expect(res.rewardYears).toBe(2);
    expect(res.qualification).toContain('10th');
  });

  it('correctly maps Lion, Counselor or Ambassador of State to 3 Years', () => {
    const res1 = getReferralRewardYears('Lion of State', 'LION_OF_STATE');
    expect(res1.rewardYears).toBe(3);
    expect(res1.qualification).toContain('12th');

    const res2 = getReferralRewardYears('Counsellor of State', 'COUNSELLOR_OF_STATE');
    expect(res2.rewardYears).toBe(3);

    const res3 = getReferralRewardYears('Ambassador of State', 'AMBASSADOR_OF_STATE');
    expect(res3.rewardYears).toBe(3);
  });

  it("correctly maps Hon'ble State Director to 4 Years", () => {
    const res = getReferralRewardYears("Hon'ble State Director", 'STATE_DIRECTOR');
    expect(res.rewardYears).toBe(4);
    expect(res.qualification).toContain('Graduates');
  });

  it('correctly maps National Council Cell to 5 Years', () => {
    const res1 = getReferralRewardYears('National Legal Council Cell', 'NATIONAL_LEGAL_COUNCIL_CELL');
    expect(res1.rewardYears).toBe(5);
    expect(res1.qualification).toContain('Graduates');

    const res2 = getReferralRewardYears('National Woman Council Cell', 'NATIONAL_WOMAN_COUNCIL_CELL');
    expect(res2.rewardYears).toBe(5);

    const res3 = getReferralRewardYears('National Minority Council Cell', 'NATIONAL_MINORITY_COUNCIL_CELL');
    expect(res3.rewardYears).toBe(5);
  });

  it('has all 5 official referral tiers defined', () => {
    expect(OFFICIAL_REFERRAL_TIERS).toHaveLength(5);
    expect(OFFICIAL_REFERRAL_TIERS.map((t) => t.rewardYears)).toEqual([1, 2, 3, 4, 5]);
  });
});

