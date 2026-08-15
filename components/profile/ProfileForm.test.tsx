import { render, screen, fireEvent } from '@testing-library/react';
import ProfileForm, { type ProfileFormValues } from './ProfileForm';

vi.mock('./ResumeUpload', () => ({ default: () => <div>mock-resume-upload</div> }));

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
});
