import { redirect } from 'next/navigation';

export default function LegacyUsersPage(){
 redirect('/dashboard/settings/users');
}
