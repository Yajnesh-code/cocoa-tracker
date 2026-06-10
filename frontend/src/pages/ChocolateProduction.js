import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

function selectBatchOptions(batchNumbers) {
  return (
    <>
      <option value="">Select production batch...</option>
      {batchNumbers.map((batchNo) => (
        <option key={batchNo} value={batchNo}>{batchNo}</option>
      ))}
    </>
  );
}

export default function ChocolateProduction() {
  const [inventory, setInventory] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [step1, setStep1] = useState({
    source_batch_code: '',
    recipe_id: '',
    nibs_quantity_used_kg: '',
    start_time: '',
    end_time: '',
    power_failure: false,
    remarks: '',
  });
  const [step2, setStep2] = useState({ production_batch_number: '', number_of_couverture_packs: '' });
  const [step3, setStep3] = useState({ production_batch_number: '', tempering_temperature_c: '', remarks: '' });
  const [step4, setStep4] = useState({ production_batch_number: '', weight_before_moulding_kg: '', weight_after_moulding_kg: '' });
  const [step5, setStep5] = useState({ production_batch_number: '', demoulded_quantity: '', broken_bars: '' });
  const [step6, setStep6] = useState({ production_batch_number: '', total_chocolate_weight_kg: '' });
  const [step7, setStep7] = useState({ production_batch_number: '', sample_saved: false, sample_weight_kg: '' });

  const refresh = async () => {
    try {
      const [inventoryRes, recipesRes, batchesRes] = await Promise.all([
        api.get('/cocoa-processing/inventory'),
        api.get('/chocolate-production/recipes'),
        api.get('/chocolate-production/batches'),
      ]);
      setInventory(inventoryRes.data || []);
      setRecipes(recipesRes.data || []);
      setBatches(batchesRes.data || []);
    } catch (err) {
      setError(normalizeError(err, 'Failed to load chocolate production data'));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const selectedInventory = useMemo(
    () => inventory.find((item) => item.batch_code === step1.source_batch_code),
    [inventory, step1.source_batch_code]
  );

  const availableNibsStockKg = Number(selectedInventory?.available_nibs_stock_kg || 0);
  const nibsQuantityUsedKg = Number(step1.nibs_quantity_used_kg || 0);
  const remainingNibsStockKg = Math.max(availableNibsStockKg - nibsQuantityUsedKg, 0);

  const activeProductionBatchNumbers = useMemo(
    () => Array.from(new Set(
      batches
        .filter((item) => item.status !== 'Completed')
        .map((item) => item.production_batch_number)
        .filter(Boolean)
    )),
    [batches]
  );

  const couvertureTotalWeightG = Math.round(Number(step2.number_of_couverture_packs || 0) * 500);
  const packedBarsPreview = Math.floor((Number(step6.total_chocolate_weight_kg || 0) * 1000) / 50);

  const fillNextSteps = (productionBatchNumber) => {
    setStep2((current) => ({ ...current, production_batch_number: productionBatchNumber }));
    setStep3((current) => ({ ...current, production_batch_number: productionBatchNumber }));
    setStep4((current) => ({ ...current, production_batch_number: productionBatchNumber }));
    setStep5((current) => ({ ...current, production_batch_number: productionBatchNumber }));
    setStep6((current) => ({ ...current, production_batch_number: productionBatchNumber }));
    setStep7((current) => ({ ...current, production_batch_number: productionBatchNumber }));
  };

  const submit = async (endpoint, payload, successMessage, reset) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await api.post(`/chocolate-production/${endpoint}`, payload);
      setSuccess(successMessage);
      if (reset) reset();
      await refresh();
      return response.data;
    } catch (err) {
      setError(normalizeError(err, 'Failed to save'));
    } finally {
      setLoading(false);
    }
    return null;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Chocolate Production</h1>
        <p>Current flow: Grinding + Conching, Couverture Packing, Tempering, Moulding & Weighing, De-Moulding, Packing, and Sample Retention.</p>
      </div>

      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}

        <div className="grid-2">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const result = await submit(
              'grinding-conching',
              {
                ...step1,
                source_batch_code: String(step1.source_batch_code || '').toUpperCase(),
                recipe_id: Number(step1.recipe_id),
              },
              'Grinding + Conching saved',
              () => setStep1({
                source_batch_code: '',
                recipe_id: '',
                nibs_quantity_used_kg: '',
                start_time: '',
                end_time: '',
                power_failure: false,
                remarks: '',
              })
            );

            if (result?.production_batch_number) {
              fillNextSteps(result.production_batch_number);
            }
          }}>
            <h2>Step 1 - Grinding + Conching</h2>
            <div className="form-group">
              <label>Source Batch Code *</label>
              <select value={step1.source_batch_code} onChange={(e) => setStep1({ ...step1, source_batch_code: e.target.value })} required>
                <option value="">Select source batch...</option>
                {inventory
                  .filter((item) => Number(item.available_nibs_stock_kg || 0) > 0)
                  .map((item) => (
                    <option key={item.id} value={item.batch_code}>
                      {item.batch_code} - {Number(item.available_nibs_stock_kg || 0).toFixed(2)} kg ({item.status})
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label>Available Nibs Stock</label>
              <input value={step1.source_batch_code ? `${availableNibsStockKg.toFixed(2)} kg` : ''} readOnly placeholder="Auto-filled from inventory" />
            </div>
            <div className="form-group">
              <label>Recipe Name *</label>
              <select value={step1.recipe_id} onChange={(e) => setStep1({ ...step1, recipe_id: e.target.value })} required>
                <option value="">Select recipe...</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>{recipe.recipe_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Nibs Quantity Used (kg) *</label>
              <input
                type="number"
                step="0.01"
                max={availableNibsStockKg || undefined}
                value={step1.nibs_quantity_used_kg}
                onChange={(e) => setStep1({ ...step1, nibs_quantity_used_kg: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Remaining Nibs Stock</label>
              <input value={step1.source_batch_code ? `${remainingNibsStockKg.toFixed(2)} kg` : ''} readOnly placeholder="Auto-calculated after usage" />
            </div>
            <div className="form-group">
              <label>Start Time *</label>
              <input type="datetime-local" value={step1.start_time} onChange={(e) => setStep1({ ...step1, start_time: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="datetime-local" value={step1.end_time} onChange={(e) => setStep1({ ...step1, end_time: e.target.value })} />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={step1.power_failure} onChange={(e) => setStep1({ ...step1, power_failure: e.target.checked })} />
                Power Failure
              </label>
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <textarea rows={3} value={step1.remarks} onChange={(e) => setStep1({ ...step1, remarks: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>

          <div>
            <h2>Production Batch List</h2>
            <div className="compact-help" style={{ marginBottom: 12 }}>
              Production batch numbers are created automatically when Grinding + Conching is saved.
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch No</th>
                    <th>Source</th>
                    <th>Recipe</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No production batches yet</td></tr>
                  ) : batches.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.production_batch_number}</strong></td>
                      <td>{item.source_batch_code}</td>
                      <td>{item.recipe_name || 'N/A'}</td>
                      <td><span className={`badge ${item.status === 'Completed' ? 'badge-completed' : 'badge-active'}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <form onSubmit={(e) => {
            e.preventDefault();
            submit(
              'couverture-packing',
              step2,
              'Couverture Packing saved',
              () => setStep2({ production_batch_number: step2.production_batch_number, number_of_couverture_packs: '' })
            );
          }}>
            <h2>Step 2 - Couverture Packing</h2>
            <div className="form-group">
              <label>Production Batch Number *</label>
              <select value={step2.production_batch_number} onChange={(e) => setStep2({ ...step2, production_batch_number: e.target.value })} required>
                {selectBatchOptions(activeProductionBatchNumbers)}
              </select>
            </div>
            <div className="form-group">
              <label>Number Of Couverture Packs *</label>
              <input type="number" value={step2.number_of_couverture_packs} onChange={(e) => setStep2({ ...step2, number_of_couverture_packs: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Total Weight</label>
              <input value={step2.number_of_couverture_packs ? `${couvertureTotalWeightG} g` : ''} readOnly placeholder="Auto-calculated at 500 g per pack" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>

          <form onSubmit={(e) => {
            e.preventDefault();
            submit(
              'tempering',
              step3,
              'Tempering saved',
              () => setStep3({ production_batch_number: step3.production_batch_number, tempering_temperature_c: '', remarks: '' })
            );
          }}>
            <h2>Step 3 - Tempering</h2>
            <div className="form-group">
              <label>Production Batch Number *</label>
              <select value={step3.production_batch_number} onChange={(e) => setStep3({ ...step3, production_batch_number: e.target.value })} required>
                {selectBatchOptions(activeProductionBatchNumbers)}
              </select>
            </div>
            <div className="form-group">
              <label>Tempering Temperature *</label>
              <input type="number" step="0.01" value={step3.tempering_temperature_c} onChange={(e) => setStep3({ ...step3, tempering_temperature_c: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Remarks</label>
              <textarea rows={3} value={step3.remarks} onChange={(e) => setStep3({ ...step3, remarks: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <form onSubmit={(e) => {
            e.preventDefault();
            submit(
              'moulding-weighing',
              step4,
              'Moulding & Weighing saved',
              () => setStep4({ production_batch_number: step4.production_batch_number, weight_before_moulding_kg: '', weight_after_moulding_kg: '' })
            );
          }}>
            <h2>Step 4 - Moulding & Weighing</h2>
            <div className="form-group">
              <label>Production Batch Number *</label>
              <select value={step4.production_batch_number} onChange={(e) => setStep4({ ...step4, production_batch_number: e.target.value })} required>
                {selectBatchOptions(activeProductionBatchNumbers)}
              </select>
            </div>
            <div className="form-group">
              <label>Weight Before Moulding *</label>
              <input type="number" step="0.01" value={step4.weight_before_moulding_kg} onChange={(e) => setStep4({ ...step4, weight_before_moulding_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Weight After Moulding *</label>
              <input type="number" step="0.01" value={step4.weight_after_moulding_kg} onChange={(e) => setStep4({ ...step4, weight_after_moulding_kg: e.target.value })} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>

          <form onSubmit={(e) => {
            e.preventDefault();
            submit(
              'demoulding',
              step5,
              'De-Moulding saved',
              () => setStep5({ production_batch_number: step5.production_batch_number, demoulded_quantity: '', broken_bars: '' })
            );
          }}>
            <h2>Step 5 - De-Moulding</h2>
            <div className="form-group">
              <label>Production Batch Number *</label>
              <select value={step5.production_batch_number} onChange={(e) => setStep5({ ...step5, production_batch_number: e.target.value })} required>
                {selectBatchOptions(activeProductionBatchNumbers)}
              </select>
            </div>
            <div className="form-group">
              <label>De-Moulded Quantity *</label>
              <input type="number" value={step5.demoulded_quantity} onChange={(e) => setStep5({ ...step5, demoulded_quantity: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Broken Bars</label>
              <input type="number" value={step5.broken_bars} onChange={(e) => setStep5({ ...step5, broken_bars: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <form onSubmit={(e) => {
            e.preventDefault();
            submit(
              'packing',
              step6,
              'Packing saved (bars auto-calculated)',
              () => setStep6({ production_batch_number: step6.production_batch_number, total_chocolate_weight_kg: '' })
            );
          }}>
            <h2>Step 6 - Packing</h2>
            <div className="form-group">
              <label>Production Batch Number *</label>
              <select value={step6.production_batch_number} onChange={(e) => setStep6({ ...step6, production_batch_number: e.target.value })} required>
                {selectBatchOptions(activeProductionBatchNumbers)}
              </select>
            </div>
            <div className="form-group">
              <label>Total Chocolate Weight (kg) *</label>
              <input type="number" step="0.01" value={step6.total_chocolate_weight_kg} onChange={(e) => setStep6({ ...step6, total_chocolate_weight_kg: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Packed Bars</label>
              <input value={step6.total_chocolate_weight_kg ? String(packedBarsPreview) : ''} readOnly placeholder="Auto-calculated at 50 g per bar" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </form>

          <form onSubmit={(e) => {
            e.preventDefault();
            submit(
              'sample-retention',
              step7,
              'Sample Retention saved and batch completed',
              () => setStep7({ production_batch_number: step7.production_batch_number, sample_saved: false, sample_weight_kg: '' })
            );
          }}>
            <h2>Step 7 - Sample Retention</h2>
            <div className="form-group">
              <label>Production Batch Number *</label>
              <select value={step7.production_batch_number} onChange={(e) => setStep7({ ...step7, production_batch_number: e.target.value })} required>
                {selectBatchOptions(activeProductionBatchNumbers)}
              </select>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={step7.sample_saved} onChange={(e) => setStep7({ ...step7, sample_saved: e.target.checked })} />
                Sample Saved
              </label>
            </div>
            <div className="form-group">
              <label>Sample Weight (kg)</label>
              <input type="number" step="0.01" value={step7.sample_weight_kg} onChange={(e) => setStep7({ ...step7, sample_weight_kg: e.target.value })} />
            </div>
            <button className="btn btn-accent" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Finish Batch'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
