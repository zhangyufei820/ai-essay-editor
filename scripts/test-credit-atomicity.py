"""Integration checks against the disposable local PostgreSQL credit fixture.

Uses only 127.0.0.1:55439/postgres; load the minimal fixture schema and migrations
014/015 first. No production configuration or environment credentials are read.
"""
import concurrent.futures
import json
import subprocess

PSQL = ["psql", "-h", "127.0.0.1", "-p", "55439", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"]


def sql(statement, fail=False):
    result = subprocess.run(PSQL, input=statement, text=True, capture_output=True)
    if fail:
        assert result.returncode != 0, "Expected transaction to fail"
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def scalar(statement):
    return sql(statement).splitlines()[-1]


def concurrent_runs(statement, count=12):
    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as executor:
        return list(executor.map(lambda _: sql(statement), range(count)))


def check(name, condition):
    assert condition, name
    print("PASS " + name)


# The fixture is deliberately recognizable before any test data are changed.
assert scalar("SELECT count(*) FROM pg_database WHERE datname = 'postgres'") == "1"
assert scalar("SELECT current_setting('port')") == "55439"
sql("TRUNCATE membership_credit_grants, credit_transactions, orders, auth_user_bridges, user_credits RESTART IDENTITY CASCADE")
target = "11111111-1111-4111-8111-111111111111"
sql(f"INSERT INTO auth_user_bridges VALUES ('authing','credit-test-legacy','{target}')")
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
    list(executor.map(lambda i: sql(f"SELECT * FROM ensure_credit_account('{target if i % 2 else 'credit-test-legacy'}')"), range(12)))
check("concurrent aliases initialize one 1000-credit account", scalar("SELECT count(*) || ':' || sum(credits) FROM user_credits") == "1:1000")
check("initialization records exactly one ledger row", scalar("SELECT count(*) FROM credit_transactions WHERE type='register'") == "1")
sql(f"UPDATE user_credits SET credits=0 WHERE user_id='{target}'")
sql("SELECT * FROM ensure_credit_account('credit-test-legacy')")
check("actual zero never receives a second signup grant", scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "0")

sql("INSERT INTO user_credits VALUES ('credit-test-legacy',300,true,now())")
sql(f"UPDATE user_credits SET credits=700 WHERE user_id='{target}'")
sql("SELECT * FROM spend_real_credits_atomic('credit-test-legacy',125,'consume','canonical spend')")
check("spend merges existing balances and charges canonical account", scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "875" and scalar("SELECT credits FROM user_credits WHERE user_id='credit-test-legacy'") == "0")
check("merge transfer pair conserves the account total", scalar("SELECT count(*) || ':' || sum(amount) FROM credit_transactions WHERE reference_id LIKE 'identity-merge:%'") == "2:0")
check("spend ledger uses canonical identity", scalar("SELECT user_id FROM credit_transactions WHERE description='canonical spend'") == target)
sql("SELECT * FROM spend_real_credits_atomic('credit-test-legacy',25,'membership_grant','unsupported type')", fail=True)
check("ledger constraint failure rolls back the debit", scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "875")
check("insufficient funds do not debit", scalar("SELECT spent FROM spend_real_credits_atomic('credit-test-legacy',9999,'consume','insufficient')") == "f")

sql("INSERT INTO orders VALUES (1,'credit-test-legacy','paid','premium',1228.8,now()-interval '3 months',NULL)")
outputs = concurrent_runs("SELECT applied FROM grant_membership_credits_once(1,1,12000,'monthly concurrent')")
check("concurrent monthly runs apply exactly once", outputs.count("t") == 1 and outputs.count("f") == 11)
check("monthly credit and ledger use canonical identity", scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "12875" and scalar("SELECT count(*) FROM credit_transactions WHERE description='monthly concurrent' AND type='bonus'") == "1")
check("monthly marker records the committed transaction", scalar("SELECT count(*) FROM membership_credit_grants WHERE order_id=1 AND period=1 AND transaction_id IS NOT NULL") == "1")
sql("SELECT * FROM grant_membership_credits_once(1,1,1000,'changed amount')", fail=True)
sql("SELECT * FROM grant_membership_credits_once(1,11,12000,'future period')", fail=True)
check("amount changes and future periods fail without crediting", scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "12875")

sql("CREATE FUNCTION credit_test_fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description='force rollback' THEN RAISE EXCEPTION 'test ledger failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER credit_test_fail BEFORE INSERT ON credit_transactions FOR EACH ROW EXECUTE FUNCTION credit_test_fail_ledger();")
sql("SELECT * FROM grant_membership_credits_once(1,2,12000,'force rollback')", fail=True)
check("failed monthly ledger rolls back balance and dedupe marker", scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "12875" and scalar("SELECT count(*) FROM membership_credit_grants WHERE order_id=1 AND period=2") == "0")
sql("DROP TRIGGER credit_test_fail ON credit_transactions; DROP FUNCTION credit_test_fail_ledger()")
sql(f"INSERT INTO membership_credit_grants(order_id,period,credit_user_id,credits,status,metadata) VALUES(1,2,'{target}',12000,'reconciled','{{\"source\":\"historical_audit\"}}')")
check("historically reconciled period cannot be paid again", scalar("SELECT applied FROM grant_membership_credits_once(1,2,12000,'already reconciled')") == "f" and scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "12875")
sql(f"INSERT INTO credit_transactions(user_id,amount,type,description,reference_id,balance_before,balance_after) VALUES('credit-test-legacy',12000,'bonus','prior historical grant','membership_monthly:1:3',0,12000)")
check("historical ledger on old identity prevents repayment", scalar("SELECT applied FROM grant_membership_credits_once(1,3,12000,'already in old ledger')") == "f" and scalar(f"SELECT credits FROM user_credits WHERE user_id='{target}'") == "12875")

sql("INSERT INTO orders VALUES (3,'credit-test-empty-paid-account','paid','premium',1228.8,now()-interval '3 months',NULL)")
sql("SELECT * FROM grant_membership_credits_once(3,1,12000,'monthly without signup bonus')")
check("monthly grant does not add a signup bonus to a missing paid account", scalar("SELECT credits FROM user_credits WHERE user_id='credit-test-empty-paid-account'") == "12000")

for role in ["anon", "authenticated"]:
    for call in ["ensure_credit_account('credit-test-legacy')", "grant_membership_credits_once(1,1,12000,'unauthorized')", "spend_real_credits_atomic('credit-test-legacy',1,'consume','unauthorized')"]:
        sql(f"SET ROLE {role}; SELECT * FROM {call}", fail=True)
check("anonymous and authenticated callers cannot mutate via RPC", True)
sql("SELECT * FROM ensure_credit_account('')", fail=True)
sql("SELECT * FROM spend_real_credits_atomic('credit-test-legacy',-1,'consume','negative')", fail=True)
sql("INSERT INTO orders VALUES (2,'credit-test-legacy','pending','premium',1228.8,now()-interval '3 months',NULL)")
sql("SELECT * FROM grant_membership_credits_once(2,1,12000,'unpaid')", fail=True)
check("invalid identities, debit amounts and unpaid orders are rejected", True)
print(json.dumps({"result": "PASS", "database": "disposable local PostgreSQL", "concurrentRequests": 24}))
