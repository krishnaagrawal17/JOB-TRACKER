import { render, screen, fireEvent } from '@testing-library/react';
import ExtractedJobForm, { type ExtractedJobFormValues } from './ExtractedJobForm';

const emptyValues: ExtractedJobFormValues = {
  title: '',
  company: '',
  location: '',
  salary: '',
  description: '',
  sourceUrl: '',
};

describe('ExtractedJobForm', () => {
  it('renders the given field values', () => {
    render(
      <ExtractedJobForm
        value={{ ...emptyValues, title: 'Engineer', company: 'Acme' }}
        onChange={() => {}}
        onSubmit={() => {}}
        submitLabel="Add Job"
      />
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Engineer');
    expect(screen.getByLabelText('Company')).toHaveValue('Acme');
  });

  it('calls onChange with the updated field when the user edits an input', () => {
    const onChange = vi.fn();
    render(<ExtractedJobForm value={emptyValues} onChange={onChange} onSubmit={() => {}} submitLabel="Add Job" />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledWith({ ...emptyValues, title: 'New Title' });
  });

  it('calls onSubmit when the submit button is clicked', () => {
    const onSubmit = vi.fn();
    render(<ExtractedJobForm value={emptyValues} onChange={() => {}} onSubmit={onSubmit} submitLabel="Add Job" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
