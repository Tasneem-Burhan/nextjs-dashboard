'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import bcrypt from 'bcrypt';
import axios from 'axios';

const FormShcema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error: "please select a customer",
    }),
    amount: z.coerce
        .number()
        .gt(0, { message: "please enter amount greater than $0" }),
    status: z.enum(['pending', 'paid'], {
        invalid_type_error: "Please select an invoice status.",
    }),
    date: z.string(),
});

const CreateInvoice = FormShcema.omit({ id: true, date: true });

export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
}

export async function createInvoice(prevState: State, formData: FormData) {
    const validatedFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    console.log(validatedFields);
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Create Invoice.',
        };
    }
    // Prepare data for insertion into the database
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];
    try {
        await sql`
          INSERT INTO invoices (customer_id, amount, status, date)
          VALUES (${customerId}, ${amountInCents}, ${status}, ${date})`;
    } catch (error) {
        return {
            message: "Database error : failed to create invoice"
        };
    }

    revalidatePath('/dashboard/invoices');
    return redirect('/dashboard/invoices');
}

const UpdateInvoice = FormShcema.omit({ id: true, date: true });

export async function updateInvoice(id: string, prevState: State, formData: FormData) {
    const validatedFields = UpdateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Update Invoice.',
        };
    }

    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;

    try {
        await sql`
        UPDATE invoices
        SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
        WHERE id = ${id}
        `
    } catch (error) {
        return {
            message: "Database error : Failed to update this invoice"
        };
    }

    revalidatePath('/dashboard/invoices');
    return redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
    try {
        await sql`
        DELETE FROM invoices where id= ${id}`;
        return redirect('/dashboard/invoices');
        return {
            message: "Invoice deleted successfully"
        };
    } catch (error) {
        return {
            message: "Database error : Failed to delete this invoice"
        };
    }

}

export async function authenticate(prevState: string | undefined, formData: FormData) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}

const UserFormShcema = z.object({
    // id: z.string().optional(),
    name: z.string({
        required_error : "Username missing",
    }).trim().min(6, "Give User name"),
    email: z.string().trim().min(1, "Give a valid email Address"),
    password: z.string().min(6, "Enter password"),
    confirmPassword: z.string().min(6, "Enter confirm password"),
   });

export type UserState = {
    errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
        confirmPassword? : string[];
    };
    message?: string | null;
}

export async function userRegister(prevState : UserState , formData : FormData) {
    console.log("clicked")
    const uservalidatedFields = UserFormShcema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
        confirmPassword : formData.get('confirmPassword')
    });
   
    if (!uservalidatedFields.success) {
        return {
            errors: uservalidatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Create new user.',
        };
    }
   
    // Prepare data for insertion into the database
    const { name , email , password , confirmPassword} = uservalidatedFields.data;

    if (password !== confirmPassword) {
        return {
            errors: {
                confirmPassword: ["Password does not match"]
            },
            message: 'Password and Confirm password dont match',
        };
    }
    
    const verfiyEmail = await sql 
    ` SELECT * from users where email = ${email}`;
    // console.log(verfiyEmail);
    if (verfiyEmail) {
        return {
            errors: {
                email: ["Email already exist!"]
            },
            message: 'Email already in use!',
        };
    }

    const salt = bcrypt.genSaltSync(8);
    // console.log(salt);
    const hashedPassword = bcrypt.hashSync(password, salt);
    // console.log(password,  hashedPassword);
    try {
        await sql`
          INSERT INTO users (name, email, password)
          VALUES (${name}, ${email}, ${hashedPassword})`;
    } catch (error) {
        return {
            message: "Database error : failed to create New User"
        };
    }
    
    revalidatePath('/login');
    return redirect('/login');
}
