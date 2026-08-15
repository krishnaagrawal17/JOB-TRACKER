import { render, screen, fireEvent } from '@testing-library/react';
import ProfileForm, { type ProfileFormValues } from './ProfileForm';

vi.mock('./ResumeUpload', () => ({
  default: ({ onExtracted }: { onExtracted: (resumeText: string, filename: string) => void }) => (
    <button onClick={() => onExtracted('Extracted text', 'r.pdf')}>trigger-extract</button>
  ),
}));

const emptyValues: ProfileFormValues = { resumeText: '', aboutMe: '' };

describe('ProfileForm', () => {
  it('renders the given field values', () => {
    render(
      <ProfileForm
        value={{ resumeText: 'My resume text', aboutMe: 'I like clean APIs.' }}
        onChange={() => {}}
        onSave={() => {}}
        isSaving={false}
      />
    );
    expect(screen.getByLabelText('Resume text')).toHaveValue('My resume text');
    expect(screen.getByLabelText('About me')).toHaveValue('I like clean APIs.');
  });

  it('calls onChange when the resume text is edited', () => {
    const onChange = vi.fn();
    render(<ProfileForm value={emptyValues} onChange={onChange} onSave={() => {}} isSaving={false} />);
    fireEvent.change(screen.getByLabelText('Resume text'), { target: { value: 'New resume' } });
    expect(onChange).toHaveBeenCalledWith({ ...emptyValues, resumeText: 'New resume' });
  });

  it('calls onSave when the Save Profile button is clicked', () => {
    const onSave = vi.fn();
    render(<ProfileForm value={emptyValues} onChange={() => {}} onSave={onSave} isSaving={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(onSave).toHaveBeenCalled();
  });

  it('disables the Save button and shows "Saving..." while isSaving is true', () => {
    render(<ProfileForm value={emptyValues} onChange={() => {}} onSave={() => {}} isSaving={true} />);
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });

  it('wires a ResumeUpload extraction into onChange as resumeText, leaving aboutMe untouched', () => {
    const onChange = vi.fn();
    render(
      <ProfileForm
        value={{ resumeText: 'Old resume', aboutMe: 'Unchanged about me' }}
        onChange={onChange}
        onSave={() => {}}
        isSaving={false}
      />
    );
    fireEvent.click(screen.getByText('trigger-extract'));
    expect(onChange).toHaveBeenCalledWith({ resumeText: 'Extracted text', aboutMe: 'Unchanged about me' });
  });
});
