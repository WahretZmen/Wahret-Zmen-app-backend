import MarketingDraft from './marketingDraft.model.js';

export async function getLatestMarketingDraft(req, res) {
  try {
    const productId = String(req.params.productId || '').trim();
    const campaignType = String(req.query.campaignType || '').trim();
    if (!productId || !['new_product', 'promotion'].includes(campaignType)) {
      return res.status(400).json({ success: false, message: 'Invalid campaign parameters' });
    }
    const draft = await MarketingDraft.findOne({ productId, campaignType })
      .sort({ createdAt: -1, _id: -1 })
      .select('subject body productUrl promotionRate source createdAt -_id')
      .lean();
    if (!draft) return res.status(404).json({ success: false, message: 'No AI marketing draft found' });
    return res.set('Cache-Control', 'no-store').json({ success: true, draft });
  } catch (error) {
    console.error('[Marketing Draft]', error);
    return res.status(500).json({ success: false, message: 'Unable to load marketing draft' });
  }
}
