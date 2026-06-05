import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

function normalizeError(err, fallback) {
  return (err.response && err.response.data && err.response.data.error) || fallback;
}

export default function RecipeMaster() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const res = await api.get('/chocolate-production/recipes');
      setRecipes(res.data);
    } catch (err) {
      setError(normalizeError(err, 'Failed to load recipes'));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (editingId) {
        await api.put(`/chocolate-production/recipes/${editingId}`, { recipe_name: name });
        setSuccess('Recipe updated');
      } else {
        await api.post('/chocolate-production/recipes', { recipe_name: name });
        setSuccess('Recipe created');
      }
      setName('');
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to save recipe'));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.delete(`/chocolate-production/recipes/${id}`);
      setSuccess('Recipe deleted');
      await refresh();
    } catch (err) {
      setError(normalizeError(err, 'Failed to delete recipe'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Recipe Master</h1>
        <p>Default recipes are preloaded. Admin can add, edit, and delete recipes.</p>
      </div>

      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}

        {user?.role === 'admin' ? (
          <form onSubmit={save}>
            <div className="form-group">
              <label>Recipe Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : editingId ? 'Update Recipe' : 'Add Recipe'}
            </button>
            {editingId ? (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                }}
                style={{ marginLeft: 8 }}
              >
                Cancel
              </button>
            ) : null}
          </form>
        ) : (
          <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>You have read-only access to recipe master.</p>
        )}
      </div>

      <div className="card">
        <h2>Recipes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipe Name</th>
                <th>Default</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipes.length === 0 ? (
                <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No recipes available</td></tr>
              ) : recipes.map((recipe) => (
                <tr key={recipe.id}>
                  <td><strong>{recipe.recipe_name}</strong></td>
                  <td>{recipe.is_default ? 'Yes' : 'No'}</td>
                  <td>{String(recipe.updated_at || recipe.created_at || '').slice(0, 10)}</td>
                  <td>
                    {user?.role === 'admin' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          type="button"
                          onClick={() => {
                            setEditingId(recipe.id);
                            setName(recipe.recipe_name);
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn btn-sm btn-danger" type="button" onClick={() => remove(recipe.id)}>
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Read only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
